#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

#include <HTTPClient.h>
#include <Update.h>

#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#include <math.h>
#include "secrets.h"

#define FIRMWARE_VERSION "1.0.4"
#define FIRMWARE_MANIFEST_URL "https://mqtt.app2-server.kr/firmware/sprout-grower/latest.json"


#define RELAY_ON  HIGH
#define RELAY_OFF LOW

String updateStatus = "idle";
int updateProgress = 0;
String latestFirmwareVersion = "";

bool firmwareUpdateInProgress = false;
unsigned long firmwareLedLastStepAt = 0;
int firmwareLedStep = 0;

static const unsigned long FIRMWARE_LED_INTERVAL_MS = 500;

void updateWifiLed27();
void updateSafetyLed14();
void updatePowerLed22();

void startFirmwareUpdate();
void beginFirmwareLedProgress();
void updateFirmwareLedProgress();
void endFirmwareLedProgress(bool restoreStateLed = true);
void markOtaPowerOnAfterReboot();
bool consumeOtaPowerOnAfterReboot();
// =======================================================
// 핀 맵 (변경 후)
// 팬               -> 26
// 안전 LED         -> 33
// WIFI LED         -> 32
// 터치 센서        -> 25
// 다이얼프램 펌프  -> 13
// 인터락 스위치    -> 27
// 전원 LED         -> 23
// 부저             -> 22
// =======================================================
static const int LED_SAFE_PIN   = 33;
static const int LED_NET_PIN    = 32;
static const int LED_POWER_PIN  = 23;

static const int PUMP_PIN       = 13;
static const int FAN_PIN        = 26;

static const int SW1_PIN        = 27;

static const int TOUCH_PIN      = 25;
static const int BUZZER_PIN     = 22;

// =======================================================
// 시스템 전원(논리적 ON/OFF)
// =======================================================
bool systemEnabled = false;

static const unsigned long TOUCH_DEBOUNCE_MS = 80;
static const unsigned long TOUCH_POWER_OFF_HOLD_MS = 2000;
static const unsigned long TOUCH_FACTORY_RESET_HOLD_MS = 8000;

int touchLastRaw = LOW;
int touchStable  = LOW;
unsigned long touchChangedAt = 0;
bool touchToggleLock = false;
unsigned long touchPressStartAt = 0;
bool touchOffHandled = false;

unsigned long touchPowerLedUntil = 0;
static const unsigned long TOUCH_POWER_LED_ON_MS = 400;

// =======================================================
// 저장소 / 서버
// =======================================================
Preferences prefs;
WebServer server(80);

volatile bool resetInProgress = false;
bool resetCleared = false;

// =======================================================
// AP / MQTT
// =======================================================
String deviceId;
String apSsid;

WiFiClientSecure net;
PubSubClient mqtt(net);

String topicCmd;
String topicState;

bool mqttReady = false;
unsigned long lastMqttTry = 0;

#define MQTT_TLS_INSECURE_TEST 1

// =======================================================
// ws 전역변수
// =======================================================
WebSocketsClient ws;

static const char* WS_HOST = "mqtt.app2-server.kr";
static const uint16_t WS_PORT = 443;
static const char* WS_PATH = "/ws";

bool wsConnected = false;
unsigned long lastWsStateAt = 0;
static const unsigned long WS_STATE_INTERVAL_MS = 3000;

void startWebSocket();
void sendWsState();
void onWsEvent(WStype_t type, uint8_t* payload, size_t length);
bool applyAppCommand(String command, bool value);
void factoryResetWifi();
bool connectStaBlocking(const String& ssid, const String& pass);
void scheduleNextAutoRunFromNow(const char* reason);
void updateManualTimeouts();
void stopAllOperationForFirmwareUpdate();
void restorePowerOnAfterOta();
void resetRuntimeState();

// =======================================================
// 인터락 유틸
// =======================================================
static inline bool swPressed(int pin) { return digitalRead(pin) == LOW; }
static inline bool interlockOk() { return swPressed(SW1_PIN); }

int  lastSw1Level  = HIGH;
bool lastInterlock = false;
bool safetyPrev    = false;

// =======================================================
// LED 페이드 파라미터
// =======================================================
static const unsigned long FADE_UP_MS   = 600;
static const unsigned long FADE_DOWN_MS = 1200;
static const unsigned long OFF_HOLD_MS  = 800;

static inline uint8_t fadeDuty8(unsigned long nowMs) {
  const unsigned long CYCLE_MS = FADE_UP_MS + FADE_DOWN_MS + OFF_HOLD_MS;
  unsigned long t = nowMs % CYCLE_MS;

  float tri;
  if (t < FADE_UP_MS) {
    tri = (float)t / (float)FADE_UP_MS;
  } else if (t < FADE_UP_MS + FADE_DOWN_MS) {
    unsigned long td = t - FADE_UP_MS;
    tri = 1.0f - ((float)td / (float)FADE_DOWN_MS);
  } else {
    tri = 0.0f;
  }

  float gamma = 2.2f;
  float y = powf(tri, 1.0f / gamma);

  int duty = (int)(y * 255.0f);
  if (duty < 0) duty = 0;
  if (duty > 255) duty = 255;
  return (uint8_t)duty;
}

// =======================================================
// LEDC 채널 고정
// =======================================================
static const int LEDC_RES  = 8;
static const int LEDC_FREQ = 5000;

static const int CH_SAFE = 0;
static const int CH_NET  = 1;

bool ledcReady = false;

void ensureLedc() {
  if (ledcReady) return;

  bool ok1 = ledcAttachChannel((uint8_t)LED_SAFE_PIN, (uint32_t)LEDC_FREQ, (uint8_t)LEDC_RES, (int8_t)CH_SAFE);
  bool ok2 = ledcAttachChannel((uint8_t)LED_NET_PIN,  (uint32_t)LEDC_FREQ, (uint8_t)LEDC_RES, (int8_t)CH_NET);

  ledcWrite((uint8_t)LED_SAFE_PIN, 0);
  ledcWrite((uint8_t)LED_NET_PIN,  0);

  Serial.printf("[LEDC] safe(pin=%d,ch=%d)=%s | net(pin=%d,ch=%d)=%s\n",
                LED_SAFE_PIN, CH_SAFE, ok1 ? "OK" : "FAIL",
                LED_NET_PIN,  CH_NET,  ok2 ? "OK" : "FAIL");

  ledcReady = true;
}

// =======================================================
// 펌웨어 업데이트 LED 프로그레스
// - 0.5초 간격
// - LED_NET_PIN -> LED_SAFE_PIN -> LED_POWER_PIN 순서로 누적 점등
// - 3개가 모두 켜진 뒤 다시 모두 OFF 후 반복
// =======================================================
void writeFirmwareLedStep(int step) {
  ensureLedc();

  // step 0: NET
  // step 1: NET + SAFE
  // step 2: NET + SAFE + POWER
  // step 3: ALL OFF
  bool netOn   = (step == 0 || step == 1 || step == 2);
  bool safeOn  = (step == 1 || step == 2);
  bool powerOn = (step == 2);

  ledcWrite((uint8_t)LED_NET_PIN,  netOn ? 255 : 0);
  ledcWrite((uint8_t)LED_SAFE_PIN, safeOn ? 255 : 0);
  digitalWrite(LED_POWER_PIN, powerOn ? HIGH : LOW);
}

void beginFirmwareLedProgress() {
  firmwareUpdateInProgress = true;
  firmwareLedStep = 0;
  firmwareLedLastStepAt = millis();

  writeFirmwareLedStep(firmwareLedStep);
}

void updateFirmwareLedProgress() {
  if (!firmwareUpdateInProgress) return;

  unsigned long now = millis();

  if (now - firmwareLedLastStepAt >= FIRMWARE_LED_INTERVAL_MS) {
    firmwareLedLastStepAt = now;
    firmwareLedStep = (firmwareLedStep + 1) % 4;
    writeFirmwareLedStep(firmwareLedStep);
  }
}

void endFirmwareLedProgress(bool restoreStateLed) {
  firmwareUpdateInProgress = false;

  ensureLedc();
  ledcWrite((uint8_t)LED_NET_PIN, 0);
  ledcWrite((uint8_t)LED_SAFE_PIN, 0);
  digitalWrite(LED_POWER_PIN, LOW);

  if (restoreStateLed) {
    updateWifiLed27();
    updateSafetyLed14();
    updatePowerLed22();
  }
}

// OTA 성공 후 재부팅되면 시스템 전원을 ON으로 올리기 위한 1회성 플래그
void markOtaPowerOnAfterReboot() {
  prefs.begin("system", false);
  prefs.putBool("ota_power_on", true);
  prefs.end();
}

bool consumeOtaPowerOnAfterReboot() {
  prefs.begin("system", false);
  bool shouldPowerOn = prefs.getBool("ota_power_on", false);

  if (shouldPowerOn) {
    prefs.putBool("ota_power_on", false);
  }

  prefs.end();
  return shouldPowerOn;
}

void restorePowerOnAfterOta() {
  systemEnabled = true;
  resetRuntimeState();
  touchPowerLedUntil = millis() + TOUCH_POWER_LED_ON_MS;
  autoImmediateRunPending = true;
  autoPrevInterlock = false;
  digitalWrite(LED_POWER_PIN, HIGH);
  Serial.println("[BOOT] OTA reboot -> systemEnabled = ON");
}

// =======================================================
// 부저
// =======================================================
static const unsigned long BUZZ_ON_MS = 120;

void beepOnce(unsigned long ms = BUZZ_ON_MS) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepPowerOn() {
  beepOnce(120);
}

void beepPowerOff() {
  beepOnce(220);
}

// =======================================================
// 펌프 요청 상태
// =======================================================
bool pumpOn = false;
uint8_t pumpDuty = 0;

bool pumpReqApp  = false;
bool pumpReqAuto = false;

// =======================================================
// 펌프 동작 파라미터
// 릴레이 방식이라 duty는 상태값 표시용으로만 사용
// =======================================================
static const uint8_t PUMP_BASE_DUTY = 255;

uint8_t pumpCurrentDuty = 0;
uint8_t pumpTargetDuty  = 0;

static inline void setPumpTarget(uint8_t duty) {
  duty = (uint8_t)constrain((int)duty, 0, 255);
  pumpTargetDuty = duty;
}

void updatePumpRamp() {
  if (pumpTargetDuty > 0) {
    digitalWrite(PUMP_PIN, RELAY_ON);
    pumpCurrentDuty = 255;
  } else {
    digitalWrite(PUMP_PIN, RELAY_OFF);
    pumpCurrentDuty = 0;
  }

  pumpDuty = pumpCurrentDuty;
  pumpOn   = (pumpCurrentDuty > 0);
}

// =======================================================
// 팬 제어
// - 펌프 종료 후 120초간만 동작
// =======================================================
static const unsigned long FAN_AFTER_PUMP_MS = 120000UL;

bool fanOn = false;
bool fanLastPumpOn = false;
unsigned long fanRunUntil = 0;

bool fanManualOverride = false;

void setFan(bool on) {
  digitalWrite(FAN_PIN, on ? RELAY_ON : RELAY_OFF);
  fanOn = on;
}

void clearFanSchedule() {
  setFan(false);
  fanRunUntil = 0;
  fanLastPumpOn = false;
}

void updateFanControl() {
  if (firmwareUpdateInProgress) {
    clearFanSchedule();
    return;
  }

  if (fanManualOverride) {
    return;
  }

  unsigned long now = millis();

  if (!systemEnabled) {
    clearFanSchedule();
    return;
  }

  if (!interlockOk()) {
    clearFanSchedule();
    return;
  }

  if (pumpOn) {
    fanLastPumpOn = true;
    setFan(false);
    fanRunUntil = 0;
    return;
  }

  if (fanLastPumpOn) {
    fanLastPumpOn = false;
    setFan(true);
    fanRunUntil = now + FAN_AFTER_PUMP_MS;
    Serial.println("[FAN] pump stopped -> fan ON");
    return;
  }

  if (fanOn) {
    if ((long)(now - fanRunUntil) >= 0) {
      setFan(false);
      fanRunUntil = 0;
      Serial.println("[FAN] OFF");
    }
  }
}

// =======================================================
// Safety LED 오버라이드
// =======================================================
bool safeLedOverride = false;
uint8_t safeLedOverrideDuty = 0;

static inline void setSafeLedOverride(uint8_t duty) {
  safeLedOverride = true;
  safeLedOverrideDuty = duty;
}

static inline void clearSafeLedOverride() {
  safeLedOverride = false;
  safeLedOverrideDuty = 0;
}

// =======================================================
// Wi-Fi 연결 상태
// =======================================================
volatile bool staConnected = false;

// =======================================================
// 펌프 요청 반영용 상태 변수
// =======================================================
bool prevWantOn = false;

// =======================================================
// 자동 동작
// - 전원 ON 직후 3초 점멸 후 20초 분사
// - 이후 2시간마다 20초 분사
// =======================================================
static const unsigned long AUTO_CHECK_INTERVAL_MS = 1000UL * 60UL * 60UL * 2UL;
static const unsigned long AUTO_RUN_MS            = 20000UL;
static const unsigned long AUTO_PRE_BLINK_MS      = 3000UL;
static const unsigned long AUTO_BLINK_INTERVAL_MS = 250UL;
static const unsigned long MANUAL_MAX_RUN_MS      = 60000UL;

unsigned long autoNextCheckAt = 0;
unsigned long autoRunEndAt    = 0;
bool autoPrevInterlock = false;
bool autoImmediateRunPending = false;
unsigned long manualPumpUntil = 0;
unsigned long manualFanUntil = 0;

enum AutoState {
  AUTO_IDLE = 0,
  AUTO_WAIT_BLINK,
  AUTO_RUNNING
};

AutoState autoState = AUTO_IDLE;
unsigned long autoBlinkUntil = 0;

// =======================================================
// 전원 OFF/ON 시 전체 런타임 상태 초기화
// =======================================================
void resetPumpRuntime() {
  pumpReqApp  = false;
  pumpReqAuto = false;
  manualPumpUntil = 0;

  prevWantOn = false;

  pumpCurrentDuty = 0;
  pumpTargetDuty  = 0;
  pumpDuty = 0;
  pumpOn = false;

  digitalWrite(PUMP_PIN, RELAY_OFF);
}

void resetFanRuntime() {
  manualFanUntil = 0;
  fanManualOverride = false;
  setFan(false);
  fanOn = false;
  fanLastPumpOn = false;
  fanRunUntil = 0;
}

void resetAutoRuntime() {
  autoState = AUTO_IDLE;
  autoNextCheckAt = 0;
  autoRunEndAt = 0;
  autoBlinkUntil = 0;
  autoPrevInterlock = false;
  autoImmediateRunPending = false;

  pumpReqAuto = false;
  clearSafeLedOverride();
}

void resetInputRuntime() {
  lastSw1Level = digitalRead(SW1_PIN);
  lastInterlock = interlockOk();
  safetyPrev = interlockOk();

  touchLastRaw = digitalRead(TOUCH_PIN);
  touchStable  = touchLastRaw;
  touchChangedAt = millis();
  touchPressStartAt = 0;
  touchOffHandled = false;
}

void resetRuntimeState() {
  resetPumpRuntime();
  resetFanRuntime();
  resetAutoRuntime();
  resetInputRuntime();

  touchPowerLedUntil = 0;
}

// =======================================================
// 자동 시퀀스
// =======================================================
void autoAbort(const char* why) {
  if (autoState != AUTO_IDLE || pumpReqAuto) {
    Serial.printf("[AUTO] abort: %s\n", why);
  }

  autoState = AUTO_IDLE;
  autoNextCheckAt = 0;
  autoRunEndAt = 0;
  autoBlinkUntil = 0;
  autoImmediateRunPending = false;
  pumpReqAuto = false;
  clearSafeLedOverride();
}

void abortAllAutoProcesses(const char* reason) {
  Serial.printf("[APP OVERRIDE] %s\n", reason);

  // 자동 분사 중단
  autoAbort(reason);

  // 팬 스케줄 중단
  fanRunUntil = 0;
  fanLastPumpOn = false;

  // 자동 요청 제거
  pumpReqAuto = false;

  // LED override 제거
  clearSafeLedOverride();
}

void scheduleNextAutoRunFromNow(const char* reason) {
  if (!systemEnabled || !interlockOk()) {
    return;
  }

  autoState = AUTO_IDLE;
  pumpReqAuto = false;
  autoRunEndAt = 0;
  autoBlinkUntil = 0;
  autoImmediateRunPending = false;
  autoPrevInterlock = true;
  autoNextCheckAt = millis() + AUTO_CHECK_INTERVAL_MS;
  clearSafeLedOverride();

  Serial.printf("[AUTO] next run scheduled after manual: %s\n", reason);
}

void updateManualTimeouts() {
  unsigned long now = millis();

  if (manualPumpUntil != 0 && (long)(now - manualPumpUntil) >= 0) {
    manualPumpUntil = 0;
    pumpReqApp = false;
    Serial.println("[MANUAL] pump timeout -> OFF");
    scheduleNextAutoRunFromNow("manual pump timeout");
    sendWsState();
  }

  if (manualFanUntil != 0 && (long)(now - manualFanUntil) >= 0) {
    manualFanUntil = 0;
    fanManualOverride = false;
    setFan(false);
    Serial.println("[MANUAL] fan timeout -> OFF");
    scheduleNextAutoRunFromNow("manual fan timeout");
    sendWsState();
  }
}

void stopAllOperationForFirmwareUpdate() {
  Serial.println("[OTA] stop all pump/fan/auto operation");

  manualPumpUntil = 0;
  manualFanUntil = 0;

  pumpReqApp = false;
  pumpReqAuto = false;
  fanManualOverride = false;

  autoAbort("firmware update");
  clearFanSchedule();
  clearSafeLedOverride();

  setPumpTarget(0);
  updatePumpRamp();
  setFan(false);

  fanRunUntil = 0;
  fanLastPumpOn = false;
}

void updateAutoSequence() {
  if (firmwareUpdateInProgress) {
    autoAbort("firmware update");
    autoPrevInterlock = false;
    return;
  }

  if (!systemEnabled) {
    autoAbort("system disabled");
    autoPrevInterlock = false;
    return;
  }

  bool nowInterlock = interlockOk();
  unsigned long now = millis();

  if (!nowInterlock) {
    autoAbort(autoPrevInterlock ? "interlock released" : "interlock not ok");
    autoPrevInterlock = false;
    return;
  }

  if (!autoPrevInterlock && nowInterlock) {
    autoPrevInterlock = true;

    if (autoImmediateRunPending || autoNextCheckAt == 0) {
      pumpReqAuto = false;
      autoRunEndAt = 0;
      autoBlinkUntil = now + AUTO_PRE_BLINK_MS;
      autoState = AUTO_WAIT_BLINK;
      autoNextCheckAt = 0;
      autoImmediateRunPending = false;
      Serial.println("[AUTO] pre-blink start -> 3s blink before pump ON");
      return;
    }

    return;
  }

  autoPrevInterlock = true;

  switch (autoState) {
    case AUTO_IDLE: {
      if (autoNextCheckAt != 0 && (long)(now - autoNextCheckAt) >= 0) {
        pumpReqAuto = false;
        autoRunEndAt = 0;
        autoBlinkUntil = now + AUTO_PRE_BLINK_MS;
        autoState = AUTO_WAIT_BLINK;
        autoNextCheckAt = 0;
        Serial.println("[AUTO] scheduled pre-blink start -> 3s blink before pump ON");
      }
    } break;

    case AUTO_WAIT_BLINK: {
      bool blinkOn = ((now / AUTO_BLINK_INTERVAL_MS) % 2) == 0;
      setSafeLedOverride(blinkOn ? 255 : 0);

      if ((long)(now - autoBlinkUntil) >= 0) {
        clearSafeLedOverride();
        pumpReqAuto = true;
        autoRunEndAt = now + AUTO_RUN_MS;
        autoState = AUTO_RUNNING;
        Serial.println("[AUTO] pre-blink end -> pump ON");
      }
    } break;

    case AUTO_RUNNING: {
      if ((long)(now - autoRunEndAt) >= 0) {
        pumpReqAuto = false;
        autoState = AUTO_IDLE;
        autoRunEndAt = 0;
        autoNextCheckAt = now + AUTO_CHECK_INTERVAL_MS;
        clearSafeLedOverride();
        Serial.println("[AUTO] RUN end -> next run scheduled");
      }
    } break;
  }
}

// =======================================================
// 터치 스위치 처리
// - OFF 상태: 짧게 터치하면 ON
// - ON 상태: 2초 롱프레스해야 OFF
// =======================================================
void updateTouchToggle() {
  int raw = digitalRead(TOUCH_PIN);

  if (raw != touchLastRaw) {
    touchLastRaw = raw;
    touchChangedAt = millis();
  }

  if (millis() - touchChangedAt >= TOUCH_DEBOUNCE_MS) {
    if (touchStable != raw) {
      touchStable = raw;

      if (touchStable == HIGH) {
        touchPressStartAt = millis();
        touchOffHandled = false;
      } else {
        touchToggleLock = false;
      }
    }
  }

  unsigned long now = millis();

  if (!systemEnabled) {
    if (touchStable == HIGH && !touchToggleLock) {
      touchToggleLock = true;

      systemEnabled = true;
      Serial.println("[TOUCH] systemEnabled = ON");

      beepPowerOn();

      resetRuntimeState();

      touchPowerLedUntil = now + TOUCH_POWER_LED_ON_MS;

      autoImmediateRunPending = true;

      setFan(false);
      fanRunUntil = 0;
      fanLastPumpOn = false;

      Serial.println("[POWER] ON - immediate spray pending");
      return;
    }
    return;
  }

  // 누르고 있는 중: 8초 이상이면 Wi-Fi 초기화
  if (touchStable == HIGH && !touchOffHandled) {
    unsigned long held = now - touchPressStartAt;

    if (held >= TOUCH_FACTORY_RESET_HOLD_MS) {
      touchOffHandled = true;
      touchToggleLock = true;

      Serial.println("[TOUCH] FACTORY RESET");

      beepOnce(600);
      factoryResetWifi();
      return;
    }
  }

  // 손을 뗐을 때: 2초 이상 8초 미만이면 전원 OFF
  if (touchStable == LOW && touchPressStartAt != 0 && !touchOffHandled) {
    unsigned long held = now - touchPressStartAt;

    if (held >= TOUCH_POWER_OFF_HOLD_MS && held < TOUCH_FACTORY_RESET_HOLD_MS) {
      touchOffHandled = true;
      touchToggleLock = true;

      systemEnabled = false;
      Serial.println("[TOUCH] long press -> systemEnabled = OFF");

      beepPowerOff();
      resetRuntimeState();

      touchPressStartAt = 0;
      touchOffHandled = true;
      touchToggleLock = true;

      return;
    }
  }

  if (touchStable == LOW && touchPressStartAt != 0) {
    touchPressStartAt = 0;
    touchOffHandled = false;
  }
}

// =======================================================
// LED 상태
// =======================================================
void updateWifiLed27() {
  if (firmwareUpdateInProgress) return;

  ensureLedc();

  if (!systemEnabled) {
    ledcWrite((uint8_t)LED_NET_PIN, 0);
    return;
  }

  if (staConnected) {
    ledcWrite((uint8_t)LED_NET_PIN, 255);
    return;
  }

  ledcWrite((uint8_t)LED_NET_PIN, fadeDuty8(millis()));
}

void updateSafetyLed14() {
  if (firmwareUpdateInProgress) return;

  ensureLedc();

  if (!systemEnabled) {
    ledcWrite((uint8_t)LED_SAFE_PIN, 0);
    return;
  }

  if (touchPowerLedUntil != 0 && (long)(touchPowerLedUntil - millis()) > 0) {
    ledcWrite((uint8_t)LED_SAFE_PIN, 255);
    return;
  }

  if (safeLedOverride) {
    ledcWrite((uint8_t)LED_SAFE_PIN, safeLedOverrideDuty);
    return;
  }

  if (interlockOk()) {
    ledcWrite((uint8_t)LED_SAFE_PIN, 255);
    return;
  }

  ledcWrite((uint8_t)LED_SAFE_PIN, fadeDuty8(millis()));
}

void updatePowerLed22() {
  if (firmwareUpdateInProgress) return;

  digitalWrite(LED_POWER_PIN, systemEnabled ? HIGH : LOW);
}

// =======================================================
// 펌프 요청 반영
// =======================================================
void applyPumpRequest() {
  if (firmwareUpdateInProgress) {
    pumpReqApp = false;
    pumpReqAuto = false;
    setPumpTarget(0);
    prevWantOn = false;
    pumpOn = false;
    pumpDuty = 0;
    return;
  }

  if (!systemEnabled) {
    setPumpTarget(0);
    prevWantOn = false;
    pumpOn = false;
    pumpDuty = 0;
    return;
  }

  bool wantOn = false;

  if (pumpReqApp) {
    if (interlockOk()) wantOn = true;
  } else if (pumpReqAuto) {
    if (interlockOk()) wantOn = true;
  }

  if (!wantOn) {
    setPumpTarget(0);
    prevWantOn = false;
    return;
  }

  setPumpTarget(PUMP_BASE_DUTY);
  prevWantOn = true;
}

// =======================================================
// Wi-Fi 유틸
// =======================================================
void clearWifiPrefs() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
  Serial.println("[WIFI] cleared saved ssid/pass");
}

void factoryResetWifi() {

  Serial.println("[FACTORY RESET] clearing wifi");

  // 저장된 WIFI 삭제
  clearWifiPrefs();

  // MQTT 종료
  if (mqtt.connected()) {
    mqtt.disconnect();
  }

  staConnected = false;

  // STA 연결 해제
  WiFi.disconnect(false, true);

  delay(500);

  Serial.println("[FACTORY RESET] reboot");

  ESP.restart();
}

String wifiStatusToStr(wl_status_t s) {
  switch (s) {
    case WL_IDLE_STATUS: return "IDLE";
    case WL_NO_SSID_AVAIL: return "NO_SSID";
    case WL_SCAN_COMPLETED: return "SCAN_DONE";
    case WL_CONNECTED: return "CONNECTED";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN";
  }
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      staConnected = true;
      Serial.printf("[WIFI] GOT_IP: %s / IP=%s RSSI=%d\n",
                    WiFi.SSID().c_str(),
                    WiFi.localIP().toString().c_str(),
                    WiFi.RSSI());
      break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      staConnected = false;
      Serial.printf("[WIFI] DISCONNECTED: reason=%d status=%s\n",
                    (int)info.wifi_sta_disconnected.reason,
                    wifiStatusToStr(WiFi.status()).c_str());
      break;

    default:
      break;
  }
}

void sendJson(int code, const String& body) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(code, "application/json; charset=utf-8", body);
}

void handleProvision() {
  if (server.method() == HTTP_OPTIONS) {
    sendJson(204, "{}");
    return;
  }

  String body = server.arg("plain");
  StaticJsonDocument<384> doc;
  DeserializationError error = deserializeJson(doc, body);

  if (error) {
    sendJson(400, "{\"ok\":false,\"message\":\"invalid json\"}");
    return;
  }

  String ssid = doc["ssid"] | "";
  String password = doc["password"] | "";

  if (ssid.length() == 0) {
    sendJson(400, "{\"ok\":false,\"message\":\"ssid required\"}");
    return;
  }

  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", password);
  prefs.end();

  WiFi.setAutoReconnect(true);
  bool ok = connectStaBlocking(ssid, password);

  String json = "{";
  json += "\"ok\":" + String(ok ? "true" : "false") + ",";
  json += "\"device_id\":\"" + deviceId + "\",";
  json += "\"ap_ssid\":\"" + apSsid + "\",";
  json += "\"sta_status\":\"" + wifiStatusToStr(WiFi.status()) + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\"";
  json += "}";

  sendJson(ok ? 200 : 500, json);

  if (ok) {
    resetInProgress = false;
    startWebSocket();
  }
}

void handleAppCommand() {
  String body = server.arg("plain");

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, body);

  if (error) {
    sendJson(400, "{\"ok\":false,\"message\":\"invalid json\"}");
    return;
  }

  String command = doc["command"] | "";
  bool value = doc["value"] | false;

  if (!applyAppCommand(command, value)) {
    sendJson(400, "{\"ok\":false,\"message\":\"unknown command\"}");
    return;
  }

  sendJson(200, "{\"ok\":true}");
}

// =======================================================
// HTTP
// =======================================================
void handleStatus() {
  String json = "{";
  json += "\"system_enabled\":" + String(systemEnabled ? "true" : "false") + ",";
  json += "\"sta_status\":\"" + wifiStatusToStr(WiFi.status()) + "\",";
  json += "\"sta_connected\":" + String(staConnected ? "true" : "false") + ",";
  json += "\"sw1_pressed\":" + String(swPressed(SW1_PIN) ? "true" : "false") + ",";
  json += "\"interlock_ok\":" + String(interlockOk() ? "true" : "false") + ",";
  json += "\"touch_raw\":" + String(digitalRead(TOUCH_PIN) == HIGH ? "true" : "false") + ",";
  json += "\"pump_on\":" + String(pumpOn ? "true" : "false") + ",";
  json += "\"pump_duty\":" + String((int)pumpDuty) + ",";
  json += "\"pump_target\":" + String((int)pumpTargetDuty) + ",";
  json += "\"pump_req_app\":" + String(pumpReqApp ? "true" : "false") + ",";
  json += "\"pump_req_auto\":" + String(pumpReqAuto ? "true" : "false") + ",";
  json += "\"fan_on\":" + String(fanOn ? "true" : "false") + ",";
  json += "\"fan_run_left_ms\":" + String(fanRunUntil == 0 ? 0 : (long)(fanRunUntil - millis())) + ",";
  json += "\"auto_state\":" + String((int)autoState) + ",";
  json += "\"auto_next_run_in_ms\":" + String(autoNextCheckAt == 0 ? 0 : max(0L, (long)(autoNextCheckAt - millis()))) + ",";
  json += "\"auto_immediate_pending\":" + String(autoImmediateRunPending ? "true" : "false");
  json += "}";
  server.send(200, "application/json; charset=utf-8", json);
}

String htmlPage() {
  return R"HTML(
<!doctype html><html><meta charset="utf-8">
<body>
<h3>ESP32 Wi-Fi Setup</h3>

<form method="POST" action="/wifi/set">
  SSID: <input name="ssid"><br>
  PASS: <input name="pass" type="password"><br>
  <button type="submit">Save & Connect</button>
</form>

<hr>
<p><a href="/status">/status</a></p>
<p><a href="/wifi/clear" onclick="return confirm('Wi-Fi 설정을 초기화할까요?')">Wi-Fi 초기화</a></p>
</body></html>
)HTML";
}

void handleRoot() {
  server.send(200, "text/html; charset=utf-8", htmlPage());
}


void handleWifiClear() {
  Serial.println("[HTTP] /wifi/clear -> reset start (no reboot)");
  resetInProgress = true;
  resetCleared = false;
  server.send(200, "text/plain", "Wi-Fi cleared. STA disconnected. AP stays on. (No reboot)");
}

void startApAlwaysOn() {
  WiFi.mode(WIFI_AP_STA);
  apSsid = "WaterPlant-" + deviceId;
  WiFi.softAP(apSsid.c_str());
  Serial.printf("[AP] SSID=%s IP=%s\n", apSsid.c_str(), WiFi.softAPIP().toString().c_str());
}

bool connectStaBlocking(const String& ssid, const String& pass) {
  Serial.printf("[STA] begin ssid=%s\n", ssid.c_str());

  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true);
  delay(200);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long t = millis();
  wl_status_t last = WL_IDLE_STATUS;

  while (WiFi.status() != WL_CONNECTED && millis() - t < 25000) {
    wl_status_t s = WiFi.status();
    if (s != last) {
      last = s;
      Serial.printf("[STA] status=%s(%d)\n", wifiStatusToStr(s).c_str(), (int)s);
    }
    delay(300);
    yield();
  }

  if (WiFi.status() == WL_CONNECTED) {
    staConnected = true;
    Serial.printf("[STA] Connected! SSID=%s IP=%s RSSI=%d\n",
                  WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI());
    return true;
  }

  staConnected = false;
  Serial.printf("[STA] connect failed. status=%s(%d)\n",
                wifiStatusToStr(WiFi.status()).c_str(), (int)WiFi.status());
  return false;
}

void handleWifiSet() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");

  if (ssid.length() == 0) {
    server.send(400, "text/plain", "ssid required");
    return;
  }

  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  WiFi.setAutoReconnect(true);
  bool ok = connectStaBlocking(ssid, pass);

  String json = "{";
  json += "\"ok\":" + String(ok ? "true" : "false") + ",";
  json += "\"sta_status\":\"" + wifiStatusToStr(WiFi.status()) + "\"";
  json += "}";
  server.send(200, "application/json; charset=utf-8", json);

  if (ok) {
    resetInProgress = false;
    startWebSocket();
  }
}

// =======================================================
// MQTT
// =======================================================
void publishState(const String& s) {
  if (!mqtt.connected()) return;
  mqtt.publish(topicState.c_str(), s.c_str(), true);
}

void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  String msg;
  msg.reserve(len);
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  msg.trim();

  if (!systemEnabled) {
    Serial.println("[MQTT] ignored because system is OFF");
    return;
  }

  if (msg.equalsIgnoreCase("FAN=ON") || msg.equalsIgnoreCase("PUMP=ON")) {
    pumpReqApp = true;
    publishState("PUMP_REQ_APP=ON");
  } else if (msg.equalsIgnoreCase("FAN=OFF") || msg.equalsIgnoreCase("PUMP=OFF")) {
    pumpReqApp = false;
    publishState("PUMP_REQ_APP=OFF");
  }

  applyPumpRequest();
}

bool connectMqttOnce() {
  if (!staConnected) return false;
  if (resetInProgress) return false;

  if (!mqttReady) {
#if MQTT_TLS_INSECURE_TEST
    net.setInsecure();
#endif
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(onMqttMessage);
    mqttReady = true;
  }

  String clientId = "esp32-" + deviceId + "-" + String((uint32_t)esp_random(), HEX);
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    mqtt.subscribe(topicCmd.c_str(), 1);
    publishState("ONLINE");
    return true;
  }
  return false;
}

void ensureMqttConnected() {
  if (!staConnected) return;
  if (resetInProgress) return;

  if (!mqtt.connected()) {
    if (millis() - lastMqttTry > 5000) {
      lastMqttTry = millis();
      connectMqttOnce();
    }
  } else {
    mqtt.loop();
  }
}


// =======================================================
// 스위치 로그
// =======================================================
void logSwitchEdgesOnce() {
  int sw1 = digitalRead(SW1_PIN);

  if (sw1 != lastSw1Level) {
    lastSw1Level = sw1;
    Serial.printf("[SW1] %s\n", sw1 == LOW ? "PRESSED" : "RELEASED");
  }

  bool nowInterlock = interlockOk();
  if (nowInterlock != lastInterlock) {
    lastInterlock = nowInterlock;
    Serial.printf("[INTERLOCK] %s\n", nowInterlock ? "OK" : "NOT OK");
  }
}

// =======================================================
// setup / loop
// =======================================================
void setup() {
  // 부팅 순간 릴레이가 튀는 것을 최대한 줄이기 위해 가장 먼저 OFF 상태를 잡음
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);

  digitalWrite(PUMP_PIN, RELAY_OFF);
  digitalWrite(FAN_PIN, RELAY_OFF);

  Serial.begin(115200);
  delay(200);

  Serial.println("[BOOT] start");
  WiFi.onEvent(onWiFiEvent);

  pinMode(LED_SAFE_PIN, OUTPUT);
  pinMode(LED_NET_PIN, OUTPUT);
  pinMode(LED_POWER_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(SW1_PIN, INPUT_PULLUP);
  //pinMode(TOUCH_PIN, INPUT);
  pinMode(TOUCH_PIN, INPUT_PULLDOWN);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_POWER_PIN, LOW);

  // 릴레이 OFF 유지
  digitalWrite(PUMP_PIN, RELAY_OFF);
  digitalWrite(FAN_PIN, RELAY_OFF);

  lastSw1Level  = digitalRead(SW1_PIN);
  lastInterlock = interlockOk();
  safetyPrev    = interlockOk();
  autoPrevInterlock = false;

  ensureLedc();

  pumpCurrentDuty = 0;
  pumpTargetDuty  = 0;
  pumpOn = false;
  pumpDuty = 0;
  prevWantOn = false;

  clearFanSchedule();

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  deviceId = String((uint32_t)ESP.getEfuseMac(), HEX);
  topicCmd   = "waterplant/" + deviceId + "/cmd";
  topicState = "waterplant/" + deviceId + "/state";

  startApAlwaysOn();

  server.on("/", handleRoot);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/wifi/set", HTTP_POST, handleWifiSet);
  server.on("/wifi/clear", HTTP_GET, handleWifiClear);

  server.on("/provision", HTTP_POST, handleProvision);
  server.on("/provision", HTTP_OPTIONS, handleProvision);
  server.on("/command", HTTP_POST, handleAppCommand);

  server.begin();
  Serial.println("[HTTP] server started");

  prefs.begin("wifi", true);
  String savedSsid = prefs.getString("ssid", "");
  String savedPass = prefs.getString("pass", "");
  prefs.end();

  if (savedSsid.length() > 0) {
    if (connectStaBlocking(savedSsid, savedPass)) {
      startWebSocket();
    }else {
      Serial.println("[STA] saved Wi-Fi connect failed (stay AP)");
    }
  } else {
    Serial.println("[STA] no saved Wi-Fi (stay AP)");
  }

  if (consumeOtaPowerOnAfterReboot()) {
    restorePowerOnAfterOta();
  }

  updateWifiLed27();
  updateSafetyLed14();
  updatePowerLed22();

  updateAutoSequence();
  applyPumpRequest();
  updatePumpRamp();
  updateFanControl();

  Serial.println("[BOOT] ready (system OFF / holding)");
}

void loop() {
  server.handleClient();
  ws.loop();
  updateFirmwareLedProgress();
  logSwitchEdgesOnce();

  updateTouchToggle();
  updateAutoSequence();
  updateManualTimeouts();

  applyPumpRequest();
  updatePumpRamp();
  updateFanControl();

  updateWifiLed27();
  updateSafetyLed14();
  updatePowerLed22();

  if (resetInProgress && !resetCleared) {
    resetCleared = true;

    pumpReqApp  = false;
    pumpReqAuto = false;
    autoAbort("reset cleanup");

    applyPumpRequest();
    updatePumpRamp();

    clearFanSchedule();

    clearWifiPrefs();

    if (mqtt.connected()) mqtt.disconnect();

    staConnected = false;
    WiFi.setAutoReconnect(false);
    WiFi.disconnect(true);
    delay(100);

    Serial.println("[RESET] STA disconnected, AP stays ON. Waiting for new /wifi/set ...");

    resetInProgress = false;
    resetCleared = false;
  }

  bool nowInter = interlockOk();
  if (safetyPrev && !nowInter) {
    if (pumpReqApp) {
      pumpReqApp = false;
      publishState("PUMP_REQ_APP=OFF (INTERLOCK)");
      Serial.println("[PUMP] App request cleared by interlock release");
    }
  }
  safetyPrev = nowInter;

  if (staConnected && wsConnected && millis() - lastWsStateAt > WS_STATE_INTERVAL_MS) {
    lastWsStateAt = millis();
    sendWsState();
  }

  delay(1);
}

void sendWsState() {
  if (!wsConnected) return;

  StaticJsonDocument<512> doc;
  doc["type"] = "state";
  doc["deviceId"] = deviceId;

  JsonObject state = doc.createNestedObject("state");
  state["firmware_version"] = FIRMWARE_VERSION;
  state["latest_firmware_version"] = latestFirmwareVersion;
  state["update_status"] = updateStatus;
  state["update_progress"] = updateProgress;

  state["system_enabled"] = systemEnabled;
  state["sta_connected"] = staConnected;
  state["interlock_ok"] = interlockOk();
  state["pump_on"] = pumpOn;
  state["pump_req_app"] = pumpReqApp;
  state["pump_req_auto"] = pumpReqAuto;
  state["fan_on"] = fanOn;
  state["fan_run_left_ms"] = fanRunUntil == 0 ? 0 : (long)(fanRunUntil - millis());
  state["auto_state"] = (int)autoState;
  state["auto_next_run_in_ms"] = autoNextCheckAt == 0 ? 0 : max(0L, (long)(autoNextCheckAt - millis()));
  state["auto_immediate_pending"] = autoImmediateRunPending;

  String json;
  serializeJson(doc, json);
  ws.sendTXT(json);
}

bool applyAppCommand(String command, bool value) {
  if (command == "running") {
    abortAllAutoProcesses("app power command");
    systemEnabled = value;

    if (!systemEnabled) {
      manualPumpUntil = 0;
      manualFanUntil = 0;
      resetRuntimeState();
      beepPowerOff();
    } else {
      resetRuntimeState();
      autoImmediateRunPending = true;
      beepPowerOn();
    }

  } else if (command == "water") {
    autoAbort("manual water command");
    pumpReqApp = value;
    manualPumpUntil = value ? millis() + MANUAL_MAX_RUN_MS : 0;

    if (!value) {
      scheduleNextAutoRunFromNow("manual water off");
    }

  } else if (command == "fan") {
    autoAbort("manual fan command");
    fanManualOverride = value;
    setFan(value);
    manualFanUntil = value ? millis() + MANUAL_MAX_RUN_MS : 0;

    if (!value) {
      scheduleNextAutoRunFromNow("manual fan off");
    }

  } else if (command == "cleanMode") {
    autoAbort("clean mode command");
    pumpReqApp = value;
    manualPumpUntil = value ? millis() + MANUAL_MAX_RUN_MS : 0;

    if (!value) {
      scheduleNextAutoRunFromNow("clean mode off");
    }

  } else if (command == "auto") {
    manualPumpUntil = 0;
    manualFanUntil = 0;
    pumpReqApp = false;
    fanManualOverride = false;
    setFan(false);
    scheduleNextAutoRunFromNow("auto command");
  } else if (command == "firmwareUpdate") {
    startFirmwareUpdate();
  } else {
    return false;
  }

  applyPumpRequest();
  updatePumpRamp();
  updateFanControl();
  sendWsState();

  return true;
}

void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      wsConnected = true;
      Serial.println("[WS] connected");

      StaticJsonDocument<256> doc;
      doc["type"] = "device_hello";
      doc["deviceId"] = deviceId;

      String json;
      serializeJson(doc, json);
      ws.sendTXT(json);

      sendWsState();
      break;
    }

    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] disconnected");
      break;

    case WStype_TEXT: {
      StaticJsonDocument<384> doc;
      DeserializationError error = deserializeJson(doc, payload, length);

      if (error) {
        Serial.println("[WS] invalid json");
        return;
      }

      String msgType = doc["type"] | "";

      if (msgType == "command") {
        String command = doc["command"] | "";
        bool value = doc["value"] | false;

        Serial.printf("[WS] command=%s value=%d\n", command.c_str(), value);
        applyAppCommand(command, value);
      }

      break;
    }

    default:
      break;
  }
}

void startWebSocket() {
  ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(5000);
}

void startFirmwareUpdate() {
  if (!staConnected) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    Serial.println("[OTA] failed: Wi-Fi not connected");
    return;
  }

  stopAllOperationForFirmwareUpdate();

  updateStatus = "updating";
  updateProgress = 1;
  sendWsState();

  beginFirmwareLedProgress();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  Serial.println("[OTA] fetching manifest");
  if (!http.begin(client, FIRMWARE_MANIFEST_URL)) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] manifest begin failed");
    return;
  }

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.printf("[OTA] manifest GET failed: %d\n", code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, body);

  if (error) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] manifest json parse failed");
    return;
  }

  String version = doc["version"] | "";
  String url = doc["url"] | "";

  latestFirmwareVersion = version;

  if (version.length() == 0 || url.length() == 0) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] manifest missing version or url");
    return;
  }

  if (version == FIRMWARE_VERSION) {
    updateStatus = "updated";
    updateProgress = 100;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] already latest");
    return;
  }

  Serial.printf("[OTA] updating %s -> %s\n", FIRMWARE_VERSION, version.c_str());
  Serial.printf("[OTA] url=%s\n", url.c_str());

  updateProgress = 5;
  sendWsState();

  HTTPClient binHttp;
  if (!binHttp.begin(client, url)) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] bin begin failed");
    return;
  }

  int binCode = binHttp.GET();
  if (binCode != HTTP_CODE_OK) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.printf("[OTA] bin GET failed: %d\n", binCode);
    binHttp.end();
    return;
  }

  int contentLength = binHttp.getSize();

  if (contentLength <= 0) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] invalid content length");
    binHttp.end();
    return;
  }

  bool canBegin = Update.begin(contentLength);

  if (!canBegin) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
    binHttp.end();
    return;
  }

  WiFiClient* stream = binHttp.getStreamPtr();
  uint8_t buffer[1024];
  int written = 0;

  while (binHttp.connected() && written < contentLength) {
    updateFirmwareLedProgress();

    size_t available = stream->available();

    if (available) {
      int readSize = stream->readBytes(buffer, min((int)available, 1024));
      size_t writeSize = Update.write(buffer, readSize);

      if (writeSize != (size_t)readSize) {
        updateStatus = "failed";
        updateProgress = 0;
        sendWsState();
        endFirmwareLedProgress(true);
        Serial.printf("[OTA] write failed: %s\n", Update.errorString());
        Update.abort();
        binHttp.end();
        return;
      }

      written += readSize;

      int nextProgress = 5 + ((written * 90) / contentLength);
      if (nextProgress != updateProgress) {
        updateProgress = nextProgress;
        sendWsState();
      }
    }

    updateFirmwareLedProgress();
    delay(1);
  }

  binHttp.end();

  if (!Update.end()) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.printf("[OTA] Update.end failed: %s\n", Update.errorString());
    return;
  }

  if (!Update.isFinished()) {
    updateStatus = "failed";
    updateProgress = 0;
    sendWsState();
    endFirmwareLedProgress(true);
    Serial.println("[OTA] update not finished");
    return;
  }

  updateStatus = "updated";
  updateProgress = 100;
  sendWsState();

  markOtaPowerOnAfterReboot();

  // 재부팅 직전에는 3개 LED를 모두 켜서 성공 상태를 잠깐 보여줌
  ensureLedc();
  ledcWrite((uint8_t)LED_NET_PIN, 255);
  ledcWrite((uint8_t)LED_SAFE_PIN, 255);
  digitalWrite(LED_POWER_PIN, HIGH);

  Serial.println("[OTA] success, rebooting");
  delay(1000);
  ESP.restart();
}

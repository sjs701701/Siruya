import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {sendDeviceCommand, sendDeviceSprayCycleCommand} from './deviceCommands';
import {
  getDeviceControlBlockReason,
  isDeviceControlReady,
} from './deviceControl';
import {
  getCommandFailureMessage,
  getControlBlockedMessage,
} from './deviceControlMessages';
import {getDeviceStatusLabel} from './deviceStatusLabel';
import {getProductDefinition} from './deviceRegistry';
import {createEmptyRuntime} from './deviceRuntime';
import {getGrowthProgress, GROWTH_CYCLE_DAYS} from './growthProgress';
import HapticPressable, {triggerToggleHaptic} from './HapticPressable';
import OdometerWheel, {
  ODOMETER_WHEEL_ITEM_HEIGHT,
  ODOMETER_WHEEL_VISIBLE_ITEMS,
} from './OdometerWheel';
import {getProductImageSource} from './productAssets';
import {
  DEFAULT_WATER_AUTO_CYCLE_MS,
  formatDuration,
  getNextSprayText,
} from './runtimeDisplay';
import {Device, DeviceCommand, DeviceRuntime, DeviceUpdater} from './types';

const CLEAN_MODE_DURATION_MS = 60 * 1000;
const MIN_SPRAY_CYCLE_MINUTES = 10;
const MAX_SPRAY_CYCLE_MINUTES = 6 * 60;

const SPRAY_HOUR_VALUES = Array.from({length: 7}, (_, hour) => String(hour));
const SPRAY_MINUTE_VALUES = Array.from({length: 60}, (_, minute) =>
  String(minute).padStart(2, '0'),
);

type PendingCommand = DeviceCommand | 'sprayCycle';

type Props = {
  device: Device | null;
  onClose: () => void;
  onUpdate: DeviceUpdater;
  onRemove: (id: string) => void;
};

type ToggleCardProps = {
  disabled?: boolean;
  disabledText?: string;
  infoMessage: string;
  label: string;
  onToggle: () => void;
  pending?: boolean;
  value: boolean;
};

function getControlStatusLabel(device: Device) {
  if (isDeviceControlReady(device)) {
    return getDeviceStatusLabel('online');
  }

  return getDeviceStatusLabel(device.status === 'setup' ? 'setup' : 'offline');
}

function getControlValueText(value: boolean, disabledText?: string) {
  return disabledText ?? (value ? '켜짐' : '꺼짐');
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateLabel(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(date.getDate()).padStart(2, '0')}`;
}

function clampDateToToday(date: Date) {
  const today = startOfLocalDay(Date.now());
  return date.getTime() > today.getTime() ? today : date;
}

export function formatSprayCycleLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}시간 ${remainingMinutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${remainingMinutes}분`;
}

function normalizeSprayCycleMinutes(hours: number, minutes: number) {
  const totalMinutes = hours * 60 + minutes;
  return normalizeSprayCycleTotalMinutes(totalMinutes);
}

function normalizeSprayCycleTotalMinutes(totalMinutes: number) {
  return Math.min(
    MAX_SPRAY_CYCLE_MINUTES,
    Math.max(MIN_SPRAY_CYCLE_MINUTES, totalMinutes),
  );
}

export function getSprayCycleMinutes(runtime: DeviceRuntime | undefined) {
  const cycleMs = runtime?.autoCycleMs ?? DEFAULT_WATER_AUTO_CYCLE_MS;
  return normalizeSprayCycleTotalMinutes(Math.round(cycleMs / 60000));
}

function DeviceDetailModal({device, onClose, onUpdate, onRemove}: Props) {
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(
    null,
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSprayCycleOpen, setIsSprayCycleOpen] = useState(false);
  const [cleanTimerEndsAt, setCleanTimerEndsAt] = useState<number | null>(null);
  const [cleanTimerNow, setCleanTimerNow] = useState(Date.now());

  useEffect(() => {
    if (!cleanTimerEndsAt) {
      return;
    }

    const interval = setInterval(() => setCleanTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cleanTimerEndsAt]);

  useEffect(() => {
    if (!device || !cleanTimerEndsAt || cleanTimerNow < cleanTimerEndsAt) {
      return;
    }

    setCleanTimerEndsAt(null);
    onUpdate(device.id, current => ({
      ...current,
      controls: {
        ...current.controls,
        cleanMode: false,
      },
    }));
    Alert.alert('청소 완료', '완료되었습니다.');
  }, [cleanTimerEndsAt, cleanTimerNow, device, onUpdate]);

  if (!device) {
    return null;
  }

  const product = getProductDefinition(device.type);
  const productImage = getProductImageSource(device.type);
  const firmwareVersion = device.runtime?.firmwareVersion ?? '알 수 없음';
  const growthProgress = getGrowthProgress(device.growthStartedAt);
  const isCommandBusy = Boolean(pendingCommand);
  const isControlReady = isDeviceControlReady(device);
  const isPowerSupported =
    device.isDemo || device.runtime?.powerControlSupported === true;
  const isPowerOff = isPowerSupported && !device.controls.power;
  const dependentControlsDisabled =
    isCommandBusy || !isControlReady || isPowerOff;
  const dependentDisabledText = isPowerOff ? '전원 꺼짐' : undefined;
  const cleanRemainingMs = cleanTimerEndsAt
    ? Math.max(cleanTimerEndsAt - cleanTimerNow, 0)
    : 0;
  const sprayCycleMinutes = getSprayCycleMinutes(device.runtime);

  const setGrowthStartedAt = (growthStartedAt: number) => {
    onUpdate(device.id, current => ({
      ...current,
      growthStartedAt,
    }));
  };

  const runCommand = async (command: DeviceCommand) => {
    if (pendingCommand) {
      return false;
    }

    const blockReason = getDeviceControlBlockReason(device);

    if (blockReason) {
      Alert.alert('기기 제어 불가', getControlBlockedMessage(blockReason));
      return false;
    }

    if (command === 'power' && !isPowerSupported) {
      Alert.alert(
        '펌웨어 업데이트 필요',
        '이 기기는 아직 전원 제어를 지원하지 않습니다. 최신 펌웨어를 적용한 뒤 다시 시도해 주세요.',
      );
      return false;
    }

    if (command !== 'power' && isPowerOff) {
      Alert.alert('전원이 꺼져 있습니다', '전원을 먼저 켠 뒤 제어해 주세요.');
      return false;
    }

    const nextValue = !device.controls[command];
    setPendingCommand(command);

    try {
      await sendDeviceCommand({device, command, value: nextValue});
      triggerToggleHaptic(nextValue);
      onUpdate(device.id, current => ({
        ...current,
        status: 'online',
        controls: {
          ...current.controls,
          [command]: nextValue,
          ...(command === 'power' && !nextValue
            ? {
                running: false,
                water: false,
                fan: false,
                cleanMode: false,
              }
            : {}),
        },
      }));

      if (command === 'power' && !nextValue) {
        setCleanTimerEndsAt(null);
      }

      return true;
    } catch (error) {
      Alert.alert('명령 전송 실패', getCommandFailureMessage(error));
      onUpdate(device.id, current => ({
        ...current,
        status: 'offline',
      }));
      return false;
    } finally {
      setPendingCommand(null);
    }
  };

  const startCleanMode = async () => {
    const succeeded = await runCommand('cleanMode');

    if (!succeeded) {
      return;
    }

    const now = Date.now();
    setCleanTimerNow(now);
    setCleanTimerEndsAt(now + CLEAN_MODE_DURATION_MS);
  };

  const applySprayCycle = async (minutes: number) => {
    if (pendingCommand) {
      return;
    }

    const blockReason = getDeviceControlBlockReason(device);

    if (blockReason) {
      Alert.alert('기기 제어 불가', getControlBlockedMessage(blockReason));
      return;
    }

    setPendingCommand('sprayCycle');

    try {
      await sendDeviceSprayCycleCommand({device, minutes});
      const autoCycleMs = minutes * 60 * 1000;
      const now = Date.now();

      triggerToggleHaptic(true);
      onUpdate(device.id, current => ({
        ...current,
        status: 'online',
        runtime: {
          ...(current.runtime ?? createEmptyRuntime()),
          autoCycleMs,
          autoState: 'idle',
          autoRunning: false,
          autoNextRunInMs:
            current.controls.power && current.controls.running
              ? autoCycleMs
              : current.runtime?.autoNextRunInMs ?? 0,
          lastSeenAt: now,
        },
      }));
      setIsSprayCycleOpen(false);
      Alert.alert(
        '분사 주기',
        `${formatSprayCycleLabel(minutes)} 주기로 변경했습니다.`,
      );
    } catch (error) {
      Alert.alert('분사 주기 변경 실패', getCommandFailureMessage(error));
      onUpdate(device.id, current => ({
        ...current,
        status: 'offline',
      }));
    } finally {
      setPendingCommand(null);
    }
  };

  const handleCleanPress = async () => {
    const shouldStart = !device.controls.cleanMode;

    if (shouldStart && growthProgress.daysUntilHarvest > 0) {
      Alert.alert(
        '청소 전 확인',
        '성장 진행이 아직 완료되지 않았습니다. 콩나물이 남아있는지 확인한 뒤 청소를 시작해 주세요.',
        [
          {text: '취소', style: 'cancel'},
          {
            text: '청소 시작',
            onPress: () => {
              void startCleanMode();
            },
          },
        ],
      );
      return;
    }

    if (shouldStart) {
      await startCleanMode();
      return;
    }

    const succeeded = await runCommand('cleanMode');

    if (!succeeded) {
      return;
    }

    setCleanTimerEndsAt(null);
  };

  const confirmRemove = () => {
    Alert.alert(
      '기기 삭제',
      `${device.name}을 앱에서 삭제할까요? 기기 자체 설정은 초기화되지 않습니다.`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            onRemove(device.id);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent>
      <View style={styles.screen}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="transparent"
          translucent
        />
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <HapticPressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>x</Text>
            </HapticPressable>
          </View>

          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.title} numberOfLines={1}>
                {device.name || product.title}
              </Text>
              <Text style={styles.deviceMetaText} numberOfLines={1}>
                위치 {device.room}
              </Text>
              <Text style={styles.deviceMetaText} numberOfLines={1}>
                네트워크 {device.ipAddress ?? device.hardwareId ?? '확인 중'}
              </Text>
            </View>
            <View
              style={[
                styles.connectionBadge,
                !isControlReady && styles.connectionBadgeMuted,
              ]}>
              <Text
                style={[
                  styles.connectionText,
                  !isControlReady && styles.connectionTextMuted,
                ]}>
                {getControlStatusLabel(device)}
              </Text>
            </View>
          </View>

          <View style={styles.topGrid}>
            <View style={styles.productStage}>
              {productImage ? (
                <Image
                  resizeMode="contain"
                  source={productImage}
                  style={styles.productImage}
                />
              ) : (
                <View style={styles.productFallback}>
                  <Text style={styles.productFallbackText}>IMG</Text>
                </View>
              )}
            </View>

            <View style={styles.controlColumn}>
              <DeviceControlToggleCard
                disabled={isCommandBusy || !isControlReady || !isPowerSupported}
                disabledText={!isPowerSupported ? '업데이트 필요' : undefined}
                infoMessage="끄면 작동, 물 공급, 팬, 청소가 모두 멈춥니다. 켜면 다시 제어할 수 있습니다."
                label="전원"
                onToggle={() => runCommand('power')}
                pending={pendingCommand === 'power'}
                value={device.controls.power}
              />
              <DeviceControlToggleCard
                disabled={dependentControlsDisabled}
                disabledText={dependentDisabledText}
                infoMessage="켜면 자동 재배 운전을 시작합니다. 끄면 자동 운전을 멈춥니다."
                label="작동"
                onToggle={() => runCommand('running')}
                pending={pendingCommand === 'running'}
                value={device.controls.running}
              />
              <DeviceControlToggleCard
                disabled={dependentControlsDisabled}
                disabledText={dependentDisabledText}
                infoMessage="켜면 물을 즉시 공급합니다. 끄면 수동 물 공급을 멈춥니다."
                label="물"
                onToggle={() => runCommand('water')}
                pending={pendingCommand === 'water'}
                value={device.controls.water}
              />
              <DeviceControlToggleCard
                disabled={dependentControlsDisabled}
                disabledText={dependentDisabledText}
                infoMessage="켜면 팬을 수동으로 작동합니다. 끄면 팬 작동을 멈춥니다."
                label="팬"
                onToggle={() => runCommand('fan')}
                pending={pendingCommand === 'fan'}
                value={device.controls.fan}
              />
              <NextSprayCard
                onPress={() => setIsSprayCycleOpen(true)}
                runtime={device.runtime}
              />
            </View>
          </View>

          {isCommandBusy && (
            <View style={styles.busyPanel}>
              <ActivityIndicator size="small" />
              <Text style={styles.busyText}>기기에 명령 전송 중</Text>
            </View>
          )}

          <View style={styles.growthPanel}>
            <View style={styles.panelHeader}>
              <View>
                <View style={styles.labelWithInfo}>
                  <Text style={styles.panelTitle}>성장 진행</Text>
                  <InfoDot />
                </View>
                <Text style={styles.growthSummary}>
                  {growthProgress.day}일차 수확까지{' '}
                  {growthProgress.daysUntilHarvest}일
                </Text>
              </View>
              <HapticPressable
                onPress={() => setIsDatePickerOpen(true)}
                style={styles.dateButton}>
                <Text style={styles.dateButtonText}>날짜 변경</Text>
              </HapticPressable>
            </View>
            <View style={styles.growthLabels}>
              <Text style={styles.growthLabel}>시작</Text>
              <Text style={styles.growthLabel}>{GROWTH_CYCLE_DAYS}일</Text>
            </View>
            <View style={styles.growthTrack}>
              <View
                style={[
                  styles.growthFill,
                  {width: `${growthProgress.progressPercent}%`},
                ]}
              />
            </View>
          </View>

          <View style={styles.cleanPanel}>
            <View>
              <View style={styles.labelWithInfo}>
                <Text style={styles.panelTitle}>청소 모드</Text>
                <InfoDot
                  onPress={() =>
                    Alert.alert(
                      '청소 모드',
                      '콩나물 수확이 끝난 뒤 진행해 주세요. 켜면 물을 흘려 내부 청소를 진행하고, 완료되면 자동으로 멈춥니다.',
                    )
                  }
                />
              </View>
              {cleanTimerEndsAt && (
                <Text style={styles.cleanTimerText}>
                  남은 시간 {formatDuration(cleanRemainingMs)}
                </Text>
              )}
            </View>
            <HapticPressable
              disabled={dependentControlsDisabled}
              onPress={() => {
                void handleCleanPress();
              }}
              style={[
                styles.cleanStartButton,
                dependentControlsDisabled && styles.buttonDisabled,
              ]}>
              <Text style={styles.cleanStartText}>
                {device.controls.cleanMode ? '중지' : '청소 시작'}
              </Text>
            </HapticPressable>
          </View>

          <View style={styles.firmwareRow}>
            <Text style={styles.firmwareLabel}>펌웨어 정보</Text>
            <Text style={styles.firmwareValue}>현재 버전 {firmwareVersion}</Text>
          </View>

          <HapticPressable style={styles.removeButton} onPress={confirmRemove}>
            <Text style={styles.removeButtonText}>기기 삭제</Text>
          </HapticPressable>
        </ScrollView>

        <GrowthDatePickerModal
          initialDate={device.growthStartedAt}
          onClose={() => setIsDatePickerOpen(false)}
          onSelect={timestamp => {
            setGrowthStartedAt(timestamp);
            setIsDatePickerOpen(false);
          }}
          visible={isDatePickerOpen}
        />
        <SprayCycleModal
          onClose={() => setIsSprayCycleOpen(false)}
          onSelect={minutes => {
            void applySprayCycle(minutes);
          }}
          selectedMinutes={sprayCycleMinutes}
          visible={isSprayCycleOpen}
        />
      </View>
    </Modal>
  );
}

function DeviceControlToggleCard({
  disabled = false,
  disabledText,
  infoMessage,
  label,
  onToggle,
  pending = false,
  value,
}: ToggleCardProps) {
  return (
    <View style={[styles.controlCard, disabled && styles.controlCardDisabled]}>
      <View style={styles.controlCopy}>
        <View style={styles.labelWithInfo}>
          <Text style={styles.controlTitle}>{label}</Text>
          <InfoDot onPress={() => Alert.alert(label, infoMessage)} />
        </View>
        <Text style={styles.controlState}>
          {pending ? '전송 중' : getControlValueText(value, disabledText)}
        </Text>
      </View>
      <Switch
        disabled={disabled || pending}
        onValueChange={onToggle}
        thumbColor="#f4f4f4"
        trackColor={{false: '#cfcfcf', true: '#15d84f'}}
        value={value}
      />
    </View>
  );
}

function NextSprayCard({
  onPress,
  runtime,
}: {
  onPress: () => void;
  runtime?: DeviceRuntime;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const value = useMemo(() => getNextSprayText(runtime, now), [runtime, now]);

  return (
    <HapticPressable onPress={onPress} style={styles.nextSprayCard}>
      <View style={styles.labelWithInfo}>
        <Text style={styles.controlTitle}>다음분사</Text>
        <InfoDot />
      </View>
      <Text style={styles.nextSprayValue}>{value}</Text>
    </HapticPressable>
  );
}

function InfoDot({onPress}: {onPress?: () => void}) {
  const dot = (
    <View style={styles.infoDot}>
      <Text style={styles.infoDotText}>i</Text>
    </View>
  );

  if (!onPress) {
    return dot;
  }

  return (
    <HapticPressable hitSlop={8} onPress={onPress} style={styles.infoButton}>
      {dot}
    </HapticPressable>
  );
}

function GrowthDatePickerModal({
  initialDate,
  onClose,
  onSelect,
  visible,
}: {
  initialDate: number;
  onClose: () => void;
  onSelect: (timestamp: number) => void;
  visible: boolean;
}) {
  const initialLocalDate = clampDateToToday(startOfLocalDay(initialDate));
  const [selectedDate, setSelectedDate] = useState(initialLocalDate);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialLocalDate.getFullYear(), initialLocalDate.getMonth(), 1),
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextInitialDate = clampDateToToday(startOfLocalDay(initialDate));
    setSelectedDate(nextInitialDate);
    setVisibleMonth(
      new Date(nextInitialDate.getFullYear(), nextInitialDate.getMonth(), 1),
    );
  }, [initialDate, visible]);

  const monthDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from(
      {length: firstDay},
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }

    return cells;
  }, [visibleMonth]);

  if (!visible) {
    return null;
  }

  const moveMonth = (amount: number) => {
    setVisibleMonth(
      current => new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  };
  const today = startOfLocalDay(Date.now());
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextVisibleMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    1,
  );
  const isNextMonthDisabled =
    nextVisibleMonth.getTime() > currentMonthStart.getTime();

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateModalRoot}>
        <HapticPressable onPress={onClose} style={styles.dateBackdrop} />
        <View style={styles.dateDialog}>
          <View style={styles.dateHeader}>
            <HapticPressable
              onPress={() => moveMonth(-1)}
              style={styles.monthButton}>
              <Text style={styles.monthButtonText}>{'<'}</Text>
            </HapticPressable>
            <Text style={styles.dateTitle}>
              {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
            </Text>
            <HapticPressable
              disabled={isNextMonthDisabled}
              onPress={() => moveMonth(1)}
              style={[
                styles.monthButton,
                isNextMonthDisabled && styles.monthButtonDisabled,
              ]}>
              <Text style={styles.monthButtonText}>{'>'}</Text>
            </HapticPressable>
          </View>

          <View style={styles.weekRow}>
            {['일', '월', '화', '수', '목', '금', '토'].map(day => (
              <Text key={day} style={styles.weekText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {monthDays.map((date, index) => {
              const key = date ? date.toISOString() : `empty-${index}`;
              const isFutureDate = Boolean(date && date.getTime() > today.getTime());
              const selected =
                date?.getFullYear() === selectedDate.getFullYear() &&
                date?.getMonth() === selectedDate.getMonth() &&
                date?.getDate() === selectedDate.getDate();

              return (
                <HapticPressable
                  disabled={!date || isFutureDate}
                  key={key}
                  onPress={() => date && !isFutureDate && setSelectedDate(date)}
                  style={[
                    styles.dayCell,
                    selected && styles.dayCellSelected,
                    isFutureDate && styles.dayCellDisabled,
                    !date && styles.dayCellEmpty,
                  ]}>
                  <Text
                    style={[
                      styles.dayText,
                      isFutureDate && styles.dayTextDisabled,
                      selected && styles.dayTextSelected,
                    ]}>
                    {date?.getDate() ?? ''}
                  </Text>
                </HapticPressable>
              );
            })}
          </View>

          <Text style={styles.selectedDateText}>
            선택한 날짜 {formatDateLabel(selectedDate.getTime())}
          </Text>

          <View style={styles.dateActions}>
            <HapticPressable onPress={onClose} style={styles.dateCancelButton}>
              <Text style={styles.dateCancelText}>취소</Text>
            </HapticPressable>
            <HapticPressable
              onPress={() => onSelect(selectedDate.getTime())}
              style={styles.dateConfirmButton}>
              <Text style={styles.dateConfirmText}>적용</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SprayCycleModal({
  onClose,
  onSelect,
  selectedMinutes,
  visible,
}: {
  onClose: () => void;
  onSelect: (minutes: number) => void;
  selectedMinutes: number;
  visible: boolean;
}) {
  const [draftMinutes, setDraftMinutes] = useState(selectedMinutes);
  const draftHours = Math.floor(draftMinutes / 60);
  const draftMinuteValue = draftMinutes % 60;

  useEffect(() => {
    if (visible) {
      setDraftMinutes(selectedMinutes);
    }
  }, [selectedMinutes, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateModalRoot}>
        <HapticPressable onPress={onClose} style={styles.dateBackdrop} />
        <View style={styles.sprayDialog}>
          <Text style={styles.sprayTitle}>분사 주기</Text>
          <View style={styles.sprayWheelRoot}>
            <View pointerEvents="none" style={styles.sprayWheelSelection} />
            <OdometerWheel
              onSettled={nextHours =>
                setDraftMinutes(
                  normalizeSprayCycleMinutes(nextHours, draftMinuteValue),
                )
              }
              selectedIndex={draftHours}
              unitLabel="시간"
              values={SPRAY_HOUR_VALUES}
            />
            <OdometerWheel
              onSettled={nextMinutes =>
                setDraftMinutes(
                  normalizeSprayCycleMinutes(draftHours, nextMinutes),
                )
              }
              selectedIndex={draftMinuteValue}
              unitLabel="분"
              values={SPRAY_MINUTE_VALUES}
            />
            <View pointerEvents="none" style={styles.sprayWheelFadeTop} />
            <View pointerEvents="none" style={styles.sprayWheelFadeBottom} />
          </View>
          <View style={styles.dateActions}>
            <HapticPressable onPress={onClose} style={styles.dateCancelButton}>
              <Text style={styles.dateCancelText}>취소</Text>
            </HapticPressable>
            <HapticPressable
              onPress={() => onSelect(draftMinutes)}
              style={styles.dateConfirmButton}>
              <Text style={styles.dateConfirmText}>적용</Text>
            </HapticPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#e7e7e7',
    flex: 1,
  },
  body: {
    flexGrow: 1,
    paddingBottom: 42,
    paddingHorizontal: 20,
    paddingTop: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
  },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginLeft: -8,
    width: 36,
  },
  closeText: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  titleCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '700',
  },
  deviceMetaText: {
    color: '#8b9099',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  connectionBadge: {
    alignItems: 'center',
    backgroundColor: '#15d84f',
    borderColor: '#15d84f',
    borderRadius: 999,
    borderWidth: 0,
    minHeight: 28,
    minWidth: 58,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  connectionBadgeMuted: {
    backgroundColor: '#e5e7eb',
    borderColor: '#e5e7eb',
  },
  connectionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  connectionTextMuted: {
    color: '#6b7280',
  },
  topGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  productStage: {
    alignItems: 'center',
    backgroundColor: '#252525',
    borderBottomRightRadius: 18,
    borderTopRightRadius: 18,
    experimental_backgroundImage:
      'linear-gradient(135deg, #111111 0%, #5a5a5a 100%)',
    height: 360,
    justifyContent: 'center',
    marginLeft: -20,
    overflow: 'hidden',
    width: 164,
  },
  productImage: {
    height: 430,
    left: -142,
    position: 'absolute',
    top: -38,
    width: 292,
  },
  productFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  productFallbackText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  controlColumn: {
    flex: 1,
    height: 360,
    gap: 12,
  },
  controlCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 12,
  },
  controlCardDisabled: {
    opacity: 0.55,
  },
  controlCopy: {
    flex: 1,
    paddingRight: 8,
  },
  labelWithInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  controlTitle: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '800',
  },
  controlState: {
    color: '#9a9a9a',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 4,
  },
  infoDot: {
    alignItems: 'center',
    borderColor: '#555555',
    borderRadius: 7,
    borderWidth: 1,
    height: 13,
    justifyContent: 'center',
    width: 13,
  },
  infoDotText: {
    color: '#555555',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
  infoButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextSprayCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  nextSprayValue: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
  },
  busyPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  busyText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '700',
  },
  growthPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginTop: 24,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 13,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '800',
  },
  growthSummary: {
    color: '#9a9a9a',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 8,
  },
  dateButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 8,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  dateButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  growthLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  growthLabel: {
    color: '#5d5d5d',
    fontSize: 8,
    fontWeight: '600',
  },
  growthTrack: {
    backgroundColor: '#f5fbea',
    borderRadius: 999,
    height: 14,
    marginTop: 4,
    overflow: 'hidden',
  },
  growthFill: {
    backgroundColor: '#66f35f',
    borderRadius: 999,
    experimental_backgroundImage:
      'linear-gradient(to right, #67ff67, #e6ff57)',
    height: '100%',
  },
  cleanPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    minHeight: 50,
    paddingLeft: 14,
    paddingRight: 10,
  },
  cleanTimerText: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 7,
  },
  cleanStartButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 8,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  cleanStartText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  firmwareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 2,
  },
  firmwareLabel: {
    color: '#4b5563',
    fontSize: 10,
    fontWeight: '600',
  },
  firmwareValue: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '600',
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: '#ff898e',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
  },
  removeButtonText: {
    color: '#e60012',
    fontSize: 13,
    fontWeight: '800',
  },
  dateModalRoot: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  dateBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dateDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
  },
  sprayDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
  },
  sprayTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '800',
  },
  sprayWheelRoot: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    paddingHorizontal: 10,
    position: 'relative',
  },
  sprayWheelSelection: {
    backgroundColor: '#f2f3f6',
    borderRadius: 12,
    height: ODOMETER_WHEEL_ITEM_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top:
      Math.floor(ODOMETER_WHEEL_VISIBLE_ITEMS / 2) *
      ODOMETER_WHEEL_ITEM_HEIGHT,
  },
  sprayWheelFadeTop: {
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 100%)',
    height: ODOMETER_WHEEL_ITEM_HEIGHT * 1.3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sprayWheelFadeBottom: {
    bottom: 0,
    experimental_backgroundImage:
      'linear-gradient(to top, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 100%)',
    height: ODOMETER_WHEEL_ITEM_HEIGHT * 1.3,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  monthButtonDisabled: {
    opacity: 0.35,
  },
  monthButtonText: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '800',
  },
  dateTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
    marginTop: 18,
  },
  weekText: {
    color: '#6b7280',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dayCell: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  dayCellEmpty: {
    opacity: 0,
  },
  dayCellDisabled: {
    opacity: 0.28,
  },
  dayCellSelected: {
    backgroundColor: '#111111',
    borderRadius: 999,
  },
  dayText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#9ca3af',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  selectedDateText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  dateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  dateCancelButton: {
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  dateCancelText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
  },
  dateConfirmButton: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  dateConfirmText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default DeviceDetailModal;

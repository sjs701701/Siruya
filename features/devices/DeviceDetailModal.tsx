import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {sendDeviceCommand, sendFirmwareUpdateCommand} from './deviceCommands';
import {getProductDefinition} from './deviceRegistry';
import {ControlRow} from './DeviceFormFields';
import {
  fetchFirmwareManifest,
  hasDifferentFirmwareVersion,
} from './firmwareManifest';
import {
  getAutoStateLabel,
  getNextSprayText,
  hasActiveAutoCountdown,
} from './runtimeDisplay';
import {Device, DeviceCommand, DeviceRuntime, DeviceUpdater} from './types';

type Props = {
  device: Device | null;
  onClose: () => void;
  onUpdate: DeviceUpdater;
  onRemove: (id: string) => void;
};

function DeviceDetailModal({device, onClose, onUpdate, onRemove}: Props) {
  const [pendingCommand, setPendingCommand] = useState<DeviceCommand | null>(
    null,
  );
  const [isSendingFirmwareCommand, setIsSendingFirmwareCommand] =
    useState(false);

  const deviceId = device?.id;
  const product = getProductDefinition(device?.type ?? 'sprout-grower');

  useEffect(() => {
    if (!deviceId || !product.firmwareManifestUrl) {
      return;
    }

    let cancelled = false;

    fetchFirmwareManifest(product.firmwareManifestUrl)
      .then(manifest => {
        if (cancelled || !manifest.version) {
          return;
        }

        onUpdate(deviceId, current => {
          const currentRuntime = current.runtime ?? createEmptyRuntime();
          const updateAvailable = hasDifferentFirmwareVersion(
            currentRuntime.firmwareVersion,
            manifest.version,
          );
          const currentStatus = currentRuntime.firmwareUpdateStatus;
          const nextStatus =
            currentStatus === 'updating' || currentStatus === 'updated'
              ? currentStatus
              : updateAvailable
                ? 'available'
                : currentStatus ?? 'idle';

          if (
            currentRuntime.latestFirmwareVersion === manifest.version &&
            currentRuntime.firmwareUpdateStatus === nextStatus
          ) {
            return current;
          }

          return {
            ...current,
            runtime: {
              ...currentRuntime,
              latestFirmwareVersion: manifest.version,
              firmwareUpdateStatus: nextStatus,
            },
          };
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [deviceId, onUpdate, product.firmwareManifestUrl]);

  if (!device) {
    return null;
  }

  const firmwareStatus = device.runtime?.firmwareUpdateStatus ?? 'idle';
  const firmwareVersion = device.runtime?.firmwareVersion ?? '알 수 없음';
  const latestFirmwareVersion = device.runtime?.latestFirmwareVersion;
  const firmwareProgress = device.runtime?.firmwareUpdateProgress ?? 0;
  const isFirmwareUpdating =
    firmwareStatus === 'updating' || isSendingFirmwareCommand;
  const canUpdateFirmware =
    Boolean(device.runtime?.firmwareVersion) &&
    firmwareStatus === 'available' &&
    !isFirmwareUpdating;

  const runCommand = async (command: DeviceCommand) => {
    if (pendingCommand || isFirmwareUpdating) {
      return;
    }

    const nextValue = !device.controls[command];
    setPendingCommand(command);

    try {
      await sendDeviceCommand({device, command, value: nextValue});
      onUpdate(device.id, current => ({
        ...current,
        status: 'online',
        controls: {
          ...current.controls,
          [command]: nextValue,
        },
      }));
    } catch (error) {
      Alert.alert(
        '명령 전송 실패',
        error instanceof Error && error.message === 'DEVICE_IP_MISSING'
          ? '기기 IP가 없습니다. 기기를 다시 등록해주세요.'
          : '기기에 명령을 보내지 못했습니다. 연결 상태를 확인해주세요.',
      );
      onUpdate(device.id, current => ({
        ...current,
        status: 'offline',
      }));
    } finally {
      setPendingCommand(null);
    }
  };

  const markFirmwareUpdating = (progress = 0) => {
    onUpdate(device.id, current => ({
      ...current,
      controls: {
        ...current.controls,
        water: false,
        fan: false,
        cleanMode: false,
      },
      runtime: {
        ...(current.runtime ?? createEmptyRuntime()),
        firmwareUpdateStatus: 'updating',
        firmwareUpdateProgress: progress,
      },
    }));
  };

  const runFirmwareUpdate = async () => {
    if (!canUpdateFirmware || pendingCommand) {
      return;
    }

    Alert.alert(
      '펌웨어 업데이트',
      '업데이트 중에는 기기 전원을 끄지 마세요. 계속할까요?',
      [
        {text: '취소', style: 'cancel'},
        {
          text: '업데이트',
          onPress: async () => {
            setIsSendingFirmwareCommand(true);
            markFirmwareUpdating(0);

            try {
              await sendFirmwareUpdateCommand(device);
              markFirmwareUpdating(1);
            } catch {
              onUpdate(device.id, current => ({
                ...current,
                runtime: {
                  ...(current.runtime ?? createEmptyRuntime()),
                  firmwareUpdateStatus: 'failed',
                  firmwareUpdateProgress: 0,
                },
              }));
              Alert.alert(
                '업데이트 명령 실패',
                '기기에 펌웨어 업데이트 명령을 보내지 못했습니다.',
              );
            } finally {
              setIsSendingFirmwareCommand(false);
            }
          },
        },
      ],
    );
  };

  const confirmRemove = () => {
    Alert.alert(
      '기기 제거',
      `${device.name}을 앱에서 제거할까요? 기기 자체 설정은 초기화되지 않습니다.`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '제거',
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
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>x</Text>
          </Pressable>
          <Text style={styles.title}>{device.name}</Text>
          <Pressable
            accessibilityLabel="기기 제거"
            onPress={confirmRemove}
            style={styles.removeHeaderButton}>
            <Text style={styles.removeHeaderText}>제거</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.hero}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>{product.badge}</Text>
            </View>
            <Text style={styles.name}>{device.name}</Text>
            <Text style={styles.meta}>
              {device.room} · {device.status === 'online' ? '온라인' : '오프라인'}
            </Text>
          </View>

          <View style={styles.statusPanel}>
            <StatusPill
              label="전원"
              value={device.controls.running ? '켜짐' : '꺼짐'}
              active={device.controls.running}
            />
            <StatusPill
              label="물"
              value={device.controls.water ? '분사 중' : '정지'}
              active={device.controls.water}
            />
            <StatusPill
              label="팬"
              value={device.controls.fan ? '동작 중' : '정지'}
              active={device.controls.fan}
            />
            <StatusPill
              label="자동"
              value={getAutoStateLabel(device.runtime)}
              active={Boolean(device.runtime?.autoRunning)}
            />
            <NextSprayStatusPill runtime={device.runtime} />
          </View>

          {(pendingCommand || isSendingFirmwareCommand) && (
            <View style={styles.busyPanel}>
              <ActivityIndicator size="small" />
              <Text style={styles.busyText}>
                {isSendingFirmwareCommand
                  ? '업데이트 명령 전송 중'
                  : '기기에 명령 전송 중'}
              </Text>
            </View>
          )}

          <ControlRow
            title="작동"
            description="전체 운전 상태"
            value={device.controls.running}
            onValueChange={() => runCommand('running')}
            disabled={Boolean(pendingCommand) || isFirmwareUpdating}
          />

          {device.type === 'sprout-grower' ? (
            <>
              <ControlRow
                title="물 공급"
                description="펌프를 켜서 물을 순환합니다."
                value={device.controls.water}
                onValueChange={() => runCommand('water')}
                disabled={Boolean(pendingCommand) || isFirmwareUpdating}
              />
              <ControlRow
                title="팬"
                description="환기 팬을 동작합니다."
                value={device.controls.fan}
                onValueChange={() => runCommand('fan')}
                disabled={Boolean(pendingCommand) || isFirmwareUpdating}
              />
              <Pressable
                style={[
                  styles.cleanButton,
                  device.controls.cleanMode && styles.cleanButtonActive,
                ]}
                onPress={() => runCommand('cleanMode')}
                disabled={Boolean(pendingCommand) || isFirmwareUpdating}>
                <View style={styles.cleanCopy}>
                  <Text
                    style={[
                      styles.cleanTitle,
                      device.controls.cleanMode && styles.cleanTitleActive,
                    ]}>
                    청소 모드
                  </Text>
                  <Text
                    style={[
                      styles.cleanText,
                      device.controls.cleanMode && styles.cleanTextActive,
                    ]}>
                    수확 후 펌프로 물을 순환시켜 기기를 헹굽니다.
                  </Text>
                </View>
                <Text
                  style={[
                    styles.cleanState,
                    device.controls.cleanMode && styles.cleanStateActive,
                  ]}>
                  {device.controls.cleanMode ? '실행 중' : '시작'}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>제품 제어 준비 중</Text>
              <Text style={styles.emptyText}>
                새 제품군이 추가되면 이 영역에 전용 제어 화면이 연결됩니다.
              </Text>
            </View>
          )}

          <View style={styles.firmwarePanel}>
            <View style={styles.firmwareCopy}>
              <Text style={styles.firmwareTitle}>펌웨어</Text>
              <Text style={styles.firmwareText}>
                현재 버전 {firmwareVersion}
                {latestFirmwareVersion
                  ? ` · 최신 버전 ${latestFirmwareVersion}`
                  : ''}
              </Text>
              <Text style={styles.firmwareState}>
                {firmwareStatusLabel(firmwareStatus, firmwareProgress)}
              </Text>
              {isFirmwareUpdating && (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {width: `${Math.max(firmwareProgress, 5)}%`},
                    ]}
                  />
                </View>
              )}
            </View>
            <Pressable
              style={[
                styles.firmwareButton,
                !canUpdateFirmware && styles.firmwareButtonDisabled,
              ]}
              onPress={runFirmwareUpdate}
              disabled={!canUpdateFirmware}>
              <Text style={styles.firmwareButtonText}>
                {isFirmwareUpdating ? '진행 중' : '업데이트'}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.removeButton} onPress={confirmRemove}>
            <Text style={styles.removeButtonText}>이 기기 제거</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function StatusPill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <View style={[styles.statusPill, active && styles.statusPillActive]}>
      <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>
        {label}
      </Text>
      <Text style={[styles.statusValue, active && styles.statusValueActive]}>
        {value}
      </Text>
    </View>
  );
}

function NextSprayStatusPill({runtime}: {runtime?: DeviceRuntime}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const value = useMemo(() => getNextSprayText(runtime, now), [runtime, now]);
  const active = useMemo(
    () => hasActiveAutoCountdown(runtime, now),
    [runtime, now],
  );

  return <StatusPill label="다음 분사" value={value} active={active} />;
}

function createEmptyRuntime(): DeviceRuntime {
  return {
    autoState: 'idle',
    autoRunning: false,
    autoNextRunInMs: 0,
    interlockOk: false,
    fanRunLeftMs: 0,
  };
}

function firmwareStatusLabel(status: string, progress: number) {
  if (status === 'available') {
    return '업데이트 가능';
  }

  if (status === 'updating') {
    return progress > 0 ? `업데이트 중 ${progress}%` : '업데이트 준비 중';
  }

  if (status === 'updated') {
    return '최신 버전 적용 완료';
  }

  if (status === 'failed') {
    return '업데이트 실패';
  }

  return '최신 상태 확인 대기';
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  closeButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeText: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  title: {
    color: '#111827',
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  removeHeaderButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 48,
  },
  removeHeaderText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '900',
  },
  body: {
    padding: 20,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    padding: 24,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#7dd3fc',
    borderRadius: 20,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  iconText: {
    color: '#075985',
    fontSize: 22,
    fontWeight: '900',
  },
  name: {
    color: '#111827',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 16,
  },
  meta: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  statusPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  statusPill: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '47.5%',
  },
  statusPillActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
  },
  statusLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  statusLabelActive: {
    color: '#0369a1',
  },
  statusValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  statusValueActive: {
    color: '#075985',
  },
  busyPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 14,
  },
  busyText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  firmwarePanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 16,
  },
  firmwareCopy: {
    flex: 1,
    paddingRight: 12,
  },
  firmwareTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  firmwareText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  firmwareState: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
  progressTrack: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    height: 8,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#1d9bf0',
    borderRadius: 999,
    height: 8,
  },
  firmwareButton: {
    alignItems: 'center',
    backgroundColor: '#1d9bf0',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  firmwareButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  firmwareButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  cleanButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 16,
  },
  cleanButtonActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  cleanCopy: {
    flex: 1,
    paddingRight: 12,
  },
  cleanTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  cleanTitleActive: {
    color: '#ffffff',
  },
  cleanText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  cleanTextActive: {
    color: '#ccfbf1',
  },
  cleanState: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '900',
  },
  cleanStateActive: {
    color: '#ffffff',
  },
  emptyPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginTop: 12,
    padding: 16,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 50,
  },
  removeButtonText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default DeviceDetailModal;

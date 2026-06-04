import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {DeviceStatusSnapshot, fetchDeviceStatus} from './deviceCommands';
import {
  DeviceWsState,
  reconnectDeviceWebSocket,
  subscribeDeviceWebSocket,
} from './deviceWebSocket';
import {getProductDefinition} from './deviceRegistry';
import {
  fetchFirmwareManifest,
  hasDifferentFirmwareVersion,
} from './firmwareManifest';
import {Device, DeviceAutoState, FirmwareUpdateStatus} from './types';

const STORAGE_KEY = 'smart_devices_v1';
const FIRMWARE_MANIFEST_REFRESH_MS = 10 * 60 * 1000;
const DEVICE_STATE_STALE_MS = 15000;

function applyStatusSnapshot(
  device: Device,
  snapshot: DeviceStatusSnapshot,
): Device {
  const firmwareVersion =
    snapshot.firmwareVersion ?? device.runtime?.firmwareVersion;
  const latestFirmwareVersion =
    snapshot.latestFirmwareVersion ?? device.runtime?.latestFirmwareVersion;
  const manifestUpdateAvailable = hasDifferentFirmwareVersion(
    firmwareVersion,
    latestFirmwareVersion,
  );
  const snapshotFirmwareStatus =
    snapshot.firmwareUpdateStatus === 'available' && !firmwareVersion
      ? 'idle'
      : snapshot.firmwareUpdateStatus;
  const currentFirmwareStatus = device.runtime?.firmwareUpdateStatus;
  const shouldKeepLocalUpdating =
    currentFirmwareStatus === 'updating' &&
    snapshotFirmwareStatus !== 'updated' &&
    snapshotFirmwareStatus !== 'failed' &&
    manifestUpdateAvailable;
  const firmwareUpdateStatus =
    shouldKeepLocalUpdating
      ? 'updating'
      : snapshotFirmwareStatus === 'updating' ||
          snapshotFirmwareStatus === 'updated' ||
          snapshotFirmwareStatus === 'failed'
        ? snapshotFirmwareStatus
        : manifestUpdateAvailable
          ? 'available'
          : snapshotFirmwareStatus ?? currentFirmwareStatus ?? 'idle';
  const firmwareUpdateProgress = shouldKeepLocalUpdating
    ? Math.max(
        device.runtime?.firmwareUpdateProgress ?? 0,
        snapshot.firmwareUpdateProgress ?? 0,
      )
    : snapshot.firmwareUpdateProgress;

  return {
    ...device,
    status: snapshot.online ? 'online' : 'offline',
    controls: {
      ...device.controls,
      running: snapshot.running,
      water: snapshot.water,
      fan: snapshot.fan,
    },
    runtime: {
      autoState: snapshot.autoState,
      autoRunning: snapshot.autoRunning,
      autoNextRunInMs: snapshot.autoNextRunInMs,
      interlockOk: snapshot.interlockOk,
      fanRunLeftMs: snapshot.fanRunLeftMs,
      firmwareVersion,
      latestFirmwareVersion,
      firmwareUpdateStatus,
      firmwareUpdateProgress,
      lastSeenAt: Date.now(),
    },
  };
}

function autoStateFromWs(autoState?: number): DeviceAutoState {
  if (autoState === 1) {
    return 'preparing';
  }

  if (autoState === 2) {
    return 'watering';
  }

  return 'idle';
}

function snapshotFromWsState(state: DeviceWsState): DeviceStatusSnapshot {
  const autoState = autoStateFromWs(state.auto_state);
  const autoRunning =
    Boolean(state.pump_req_auto) ||
    autoState === 'preparing' ||
    autoState === 'watering';

  const firmwareUpdateStatus = normalizeFirmwareStatus(
    state.update_status,
    state.update_available,
  );

  return {
    online: Boolean(state.sta_connected),
    running: Boolean(state.system_enabled),
    water: Boolean(state.pump_on),
    fan: Boolean(state.fan_on),
    autoState,
    autoRunning,
    autoNextRunInMs: Number(state.auto_next_run_in_ms ?? 0),
    interlockOk: Boolean(state.interlock_ok),
    fanRunLeftMs: Number(state.fan_run_left_ms ?? 0),
    firmwareVersion: state.firmware_version,
    latestFirmwareVersion: state.latest_firmware_version,
    firmwareUpdateStatus,
    firmwareUpdateProgress: Number(state.update_progress ?? 0),
  };
}

function normalizeFirmwareStatus(
  status?: string,
  updateAvailable?: boolean,
): FirmwareUpdateStatus {
  if (
    status === 'updating' ||
    status === 'updated' ||
    status === 'failed' ||
    status === 'available'
  ) {
    return status;
  }

  return updateAvailable ? 'available' : 'idle';
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const devicesRef = useRef(devices);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (value) {
          setDevices(JSON.parse(value));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(devices)).catch(
      () => undefined,
    );
  }, [devices]);

  useEffect(() => {
    let cancelled = false;

    const refreshFirmwareManifests = async () => {
      const definitionsByUrl = new Map(
        devicesRef.current
          .map(device => getProductDefinition(device.type))
          .filter(product => Boolean(product.firmwareManifestUrl))
          .map(product => [product.firmwareManifestUrl as string, product]),
      );

      if (definitionsByUrl.size === 0) {
        return;
      }

      const manifests = await Promise.all(
        Array.from(definitionsByUrl.keys()).map(async url => {
          try {
            return [url, await fetchFirmwareManifest(url)] as const;
          } catch {
            return [url, null] as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      let nextSelectedDevice: Device | null | undefined;

      setDevices(currentDevices => {
        const nextDevices = currentDevices.map(device => {
          const product = getProductDefinition(device.type);

          if (!product.firmwareManifestUrl) {
            return device;
          }

          const manifest = manifests.find(
            ([url]) => url === product.firmwareManifestUrl,
          )?.[1];

          if (!manifest?.version) {
            return device;
          }

          const currentVersion = device.runtime?.firmwareVersion;
          const updateAvailable = hasDifferentFirmwareVersion(
            currentVersion,
            manifest.version,
          );
          const currentStatus = device.runtime?.firmwareUpdateStatus;
          const nextFirmwareStatus =
            currentStatus === 'updating' || currentStatus === 'updated'
              ? currentStatus
              : updateAvailable
                ? 'available'
                : currentStatus ?? 'idle';

          if (
            device.runtime?.latestFirmwareVersion === manifest.version &&
            device.runtime?.firmwareUpdateStatus === nextFirmwareStatus
          ) {
            return device;
          }

          const nextDevice = {
            ...device,
            runtime: {
              ...(device.runtime ?? {
                autoState: 'idle' as const,
                autoRunning: false,
                autoNextRunInMs: 0,
                interlockOk: false,
                fanRunLeftMs: 0,
              }),
              latestFirmwareVersion: manifest.version,
              firmwareUpdateStatus: nextFirmwareStatus,
            },
          };

          if (selectedDevice?.id === nextDevice.id) {
            nextSelectedDevice = nextDevice;
          }

          return nextDevice;
        });

        return nextDevices;
      });

      if (nextSelectedDevice) {
        setSelectedDevice(nextSelectedDevice);
      }
    };

    refreshFirmwareManifests();
    const interval = setInterval(
      refreshFirmwareManifests,
      FIRMWARE_MANIFEST_REFRESH_MS,
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [devices.length, selectedDevice?.id]);

  useEffect(() => {
    let cancelled = false;

    const refreshStatuses = async () => {
      const currentDevices = devicesRef.current;
      const nextDevices = await Promise.all(
        currentDevices.map(async device => {
          if (device.hardwareId || !device.ipAddress) {
            return device;
          }

          try {
            const snapshot = await fetchDeviceStatus(device);
            return applyStatusSnapshot(device, snapshot);
          } catch {
            return {
              ...device,
              status: 'offline' as const,
              runtime: {
                ...(device.runtime ?? {
                  autoState: 'idle' as const,
                  autoRunning: false,
                  autoNextRunInMs: 0,
                  interlockOk: false,
                  fanRunLeftMs: 0,
                }),
              },
            };
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setDevices(nextDevices);
      setSelectedDevice(current => {
        if (!current) {
          return current;
        }

        return nextDevices.find(device => device.id === current.id) ?? current;
      });
    };

    refreshStatuses();
    const interval = setInterval(refreshStatuses, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    return subscribeDeviceWebSocket(message => {
      if (
        message.type !== 'hello_ok' &&
        message.type !== 'state' &&
        message.type !== 'device_online' &&
        message.type !== 'device_offline'
      ) {
        return;
      }

      setDevices(currentDevices => {
        if (message.type === 'hello_ok') {
          const onlineDeviceIds = message.devices ?? [];
          const claimedIds = new Set(
            currentDevices
              .map(device => device.hardwareId)
              .filter((id): id is string => Boolean(id)),
          );
          const unclaimedOnlineIds = onlineDeviceIds.filter(
            deviceId => !claimedIds.has(deviceId),
          );
          const unboundDevices = currentDevices.filter(
            device =>
              !device.hardwareId &&
              (device.type === 'sprout-grower' || device.status === 'setup'),
          );

          if (unclaimedOnlineIds.length !== 1 || unboundDevices.length !== 1) {
            return currentDevices;
          }

          const [onlineDeviceId] = unclaimedOnlineIds;
          const [unboundDevice] = unboundDevices;
          const nextDevices = currentDevices.map(device =>
            device.id === unboundDevice.id
              ? {
                  ...device,
                  hardwareId: onlineDeviceId,
                  status: 'online' as const,
                }
              : device,
          );

          setSelectedDevice(current => {
            if (!current) {
              return current;
            }

            return nextDevices.find(device => device.id === current.id) ?? current;
          });

          return nextDevices;
        }

        const nextDevices = currentDevices.map(device => {
          if (device.hardwareId !== message.deviceId) {
            return device;
          }

          if (message.type === 'state') {
            return applyStatusSnapshot(
              device,
              snapshotFromWsState(message.state),
            );
          }

          return {
            ...device,
            status:
              message.type === 'device_online'
                ? ('online' as const)
                : ('offline' as const),
            runtime:
              message.type === 'device_online'
                ? {
                    ...(device.runtime ?? {
                      autoState: 'idle' as const,
                      autoRunning: false,
                      autoNextRunInMs: 0,
                      interlockOk: false,
                      fanRunLeftMs: 0,
                    }),
                    lastSeenAt: Date.now(),
                  }
                : device.runtime,
          };
        });

        setSelectedDevice(current => {
          if (!current) {
            return current;
          }

          return nextDevices.find(device => device.id === current.id) ?? current;
        });

        return nextDevices;
      });
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        reconnectDeviceWebSocket();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const markStaleDevicesOffline = () => {
      const now = Date.now();

      setDevices(currentDevices => {
        let changed = false;
        const nextDevices = currentDevices.map(device => {
          const lastSeenAt = device.runtime?.lastSeenAt;
          const isStale =
            Boolean(device.hardwareId) &&
            device.status === 'online' &&
            (!lastSeenAt || now - lastSeenAt > DEVICE_STATE_STALE_MS);

          if (!isStale) {
            return device;
          }

          changed = true;
          return {
            ...device,
            status: 'offline' as const,
          };
        });

        if (!changed) {
          return currentDevices;
        }

        setSelectedDevice(current => {
          if (!current) {
            return current;
          }

          return nextDevices.find(device => device.id === current.id) ?? current;
        });

        return nextDevices;
      });
    };

    const interval = setInterval(markStaleDevicesOffline, 5000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = useMemo(
    () => devices.filter(device => device.status === 'online').length,
    [devices],
  );

  const addDevice = (device: Device) => {
    setDevices(current => {
      const duplicateIndex = current.findIndex(existing =>
        isSamePhysicalDevice(existing, device),
      );

      if (duplicateIndex < 0) {
        setSelectedDevice(device);
        return [device, ...current];
      }

      const existing = current[duplicateIndex];
      const mergedDevice: Device = {
        ...existing,
        ...device,
        id: existing.id,
        hardwareId: device.hardwareId ?? existing.hardwareId,
        ipAddress: device.ipAddress ?? existing.ipAddress,
        controls: {
          ...existing.controls,
          ...device.controls,
        },
        runtime: existing.runtime,
      };
      const nextDevices = [...current];
      nextDevices[duplicateIndex] = mergedDevice;
      setSelectedDevice(mergedDevice);
      return nextDevices;
    });
  };

  const updateDevice = (id: string, updater: (device: Device) => Device) => {
    setDevices(current =>
      current.map(device => (device.id === id ? updater(device) : device)),
    );
    setSelectedDevice(current =>
      current && current.id === id ? updater(current) : current,
    );
  };

  const removeDevice = (id: string) => {
    setDevices(current => current.filter(device => device.id !== id));
    setSelectedDevice(current => (current?.id === id ? null : current));
  };

  return {
    devices,
    selectedDevice,
    onlineCount,
    addDevice,
    updateDevice,
    removeDevice,
    setSelectedDevice,
  };
}

function isSamePhysicalDevice(a: Device, b: Device) {
  if (a.hardwareId && b.hardwareId) {
    return a.hardwareId === b.hardwareId;
  }

  if (a.ipAddress && b.ipAddress) {
    return a.ipAddress === b.ipAddress && a.type === b.type;
  }

  return false;
}

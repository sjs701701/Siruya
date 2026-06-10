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
import {
  autoStateFromDeviceCode,
  createEmptyRuntime,
  normalizeFirmwareStatus,
} from './deviceRuntime';
import {normalizeDeviceLifecycleDates} from './growthProgress';
import {Device} from './types';

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

function snapshotFromWsState(state: DeviceWsState): DeviceStatusSnapshot {
  const autoState = autoStateFromDeviceCode(state.auto_state);
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

export function mergePolledDeviceStatuses(
  latestDevices: Device[],
  refreshedDevicesById: ReadonlyMap<string, Device>,
) {
  let changed = false;
  const nextDevices = latestDevices.map(device => {
    const refreshedDevice = refreshedDevicesById.get(device.id);

    if (!refreshedDevice || device.hardwareId) {
      return device;
    }

    changed = true;
    return {
      ...device,
      status: refreshedDevice.status,
      controls: {
        ...device.controls,
        running: refreshedDevice.controls.running,
        water: refreshedDevice.controls.water,
        fan: refreshedDevice.controls.fan,
      },
      runtime: refreshedDevice.runtime,
    };
  });

  return changed ? nextDevices : latestDevices;
}

export function shouldPersistDevices(
  hasLoadedDevices: boolean,
  canPersistDevices: boolean,
) {
  return hasLoadedDevices && canPersistDevices;
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [hasLoadedDevices, setHasLoadedDevices] = useState(false);
  const devicesRef = useRef(devices);
  const canPersistDevicesRef = useRef(false);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (cancelled) {
          return;
        }

        if (value) {
          const now = Date.now();
          const storedDevices = JSON.parse(value) as Device[];
          setDevices(
            storedDevices.map(device =>
              normalizeDeviceLifecycleDates(device, now),
            ),
          );
        }

        canPersistDevicesRef.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          canPersistDevicesRef.current = false;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedDevices(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldPersistDevices(hasLoadedDevices, canPersistDevicesRef.current)) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(devices)).catch(
      () => undefined,
    );
  }, [devices, hasLoadedDevices]);

  useEffect(() => {
    if (!hasLoadedDevices) {
      return;
    }

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

      setDevices(currentDevices => {
        let changed = false;
        const nextDevices = currentDevices.map(device => {
          if (device.isDemo) {
            return device;
          }

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
              ...(device.runtime ?? createEmptyRuntime()),
              latestFirmwareVersion: manifest.version,
              firmwareUpdateStatus: nextFirmwareStatus,
            },
          };

          changed = true;
          return nextDevice;
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

    refreshFirmwareManifests();
    const interval = setInterval(
      refreshFirmwareManifests,
      FIRMWARE_MANIFEST_REFRESH_MS,
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasLoadedDevices]);

  useEffect(() => {
    let cancelled = false;

    const refreshStatuses = async () => {
      const currentDevices = devicesRef.current;
      const refreshedDevices = await Promise.all(
        currentDevices.map(async device => {
          if (device.isDemo) {
            return null;
          }

          if (device.hardwareId || !device.ipAddress) {
            return null;
          }

          try {
            const snapshot = await fetchDeviceStatus(device);
            return [device.id, applyStatusSnapshot(device, snapshot)] as const;
          } catch {
            return [
              device.id,
              {
                ...device,
                status: 'offline' as const,
                runtime: {
                  ...(device.runtime ?? createEmptyRuntime()),
                },
              },
            ] as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const refreshedDevicesById = new Map(
        refreshedDevices.filter(
          (device): device is readonly [string, Device] => Boolean(device),
        ),
      );

      if (refreshedDevicesById.size === 0) {
        return;
      }

      setDevices(latestDevices => {
        const nextDevices = mergePolledDeviceStatuses(
          latestDevices,
          refreshedDevicesById,
        );

        if (nextDevices === latestDevices) {
          return latestDevices;
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
          return currentDevices;
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
                    ...(device.runtime ?? createEmptyRuntime()),
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
            !device.isDemo &&
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
    const normalizedDevice = normalizeDeviceLifecycleDates(device);

    setDevices(current => {
      const duplicateIndex = current.findIndex(existing =>
        isSamePhysicalDevice(existing, normalizedDevice),
      );

      if (duplicateIndex < 0) {
        setSelectedDevice(normalizedDevice);
        return [normalizedDevice, ...current];
      }

      const existing = current[duplicateIndex];
      const mergedDevice: Device = {
        ...existing,
        ...normalizedDevice,
        id: existing.id,
        registeredAt: existing.registeredAt,
        growthStartedAt: existing.growthStartedAt,
        hardwareId: normalizedDevice.hardwareId ?? existing.hardwareId,
        commandToken: normalizedDevice.commandToken ?? existing.commandToken,
        ipAddress: normalizedDevice.ipAddress ?? existing.ipAddress,
        controls: {
          ...existing.controls,
          ...normalizedDevice.controls,
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  hasFirmwareManifestUpdate,
  hasDifferentFirmwareVersion,
  hasUsableFirmwareManifest,
} from './firmwareManifest';
import {
  autoStateFromDeviceCode,
  createEmptyRuntime,
  normalizeFirmwareStatus,
} from './deviceRuntime';
import {normalizeDeviceLifecycleDates} from './growthProgress';
import {Device, FirmwareUpdateStatus} from './types';

const STORAGE_KEY = 'smart_devices_v1';
const CORRUPT_STORAGE_BACKUP_KEY = 'smart_devices_v1_corrupt_backup';
const FIRMWARE_MANIFEST_REFRESH_MS = 10 * 60 * 1000;
const DEVICE_STATE_STALE_MS = 15000;
const DEVICE_STATE_ANCHOR_TOLERANCE_MS = 2000;

type DeviceLoadState =
  | {status: 'loading'}
  | {status: 'loaded'}
  | {
      status: 'error';
      error: 'DEVICE_STORAGE_READ_FAILED' | 'DEVICE_STORAGE_BACKUP_FAILED';
    };

type DevicePersistState =
  | {status: 'idle'}
  | {status: 'saving'}
  | {status: 'error'; error: 'DEVICE_STORAGE_WRITE_FAILED'};

type StoredDevice = Pick<
  Device,
  | 'id'
  | 'registeredAt'
  | 'growthStartedAt'
  | 'name'
  | 'type'
  | 'room'
  | 'ipAddress'
> &
  Partial<Pick<Device, 'hardwareId' | 'commandToken' | 'isDemo'>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeviceType(value: unknown): value is Device['type'] {
  return value === 'sprout-grower' || value === 'future-device';
}

function isRuntimeAutoState(
  value: unknown,
): value is NonNullable<Device['runtime']>['autoState'] {
  return value === 'idle' || value === 'preparing' || value === 'watering';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function readOptionalTimestamp(value: unknown) {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function createDefaultControls(): Device['controls'] {
  return {
    running: false,
    water: false,
    fan: false,
    cleanMode: false,
  };
}

function readLegacyControls(value: unknown): Device['controls'] {
  const defaultControls = createDefaultControls();

  if (!isRecord(value)) {
    return defaultControls;
  }

  return {
    running:
      typeof value.running === 'boolean'
        ? value.running
        : defaultControls.running,
    water:
      typeof value.water === 'boolean' ? value.water : defaultControls.water,
    fan: typeof value.fan === 'boolean' ? value.fan : defaultControls.fan,
    cleanMode:
      typeof value.cleanMode === 'boolean'
        ? value.cleanMode
        : defaultControls.cleanMode,
  };
}

function readLegacyRuntime(value: unknown): Device['runtime'] {
  if (!isRecord(value)) {
    return undefined;
  }

  const defaultRuntime = createEmptyRuntime();

  return {
    autoState: isRuntimeAutoState(value.autoState)
      ? value.autoState
      : defaultRuntime.autoState,
    autoRunning:
      typeof value.autoRunning === 'boolean'
        ? value.autoRunning
        : defaultRuntime.autoRunning,
    autoNextRunInMs: isFiniteNumber(value.autoNextRunInMs)
      ? value.autoNextRunInMs
      : defaultRuntime.autoNextRunInMs,
    interlockOk:
      typeof value.interlockOk === 'boolean'
        ? value.interlockOk
        : defaultRuntime.interlockOk,
    fanRunLeftMs: isFiniteNumber(value.fanRunLeftMs)
      ? value.fanRunLeftMs
      : defaultRuntime.fanRunLeftMs,
    firmwareVersion:
      typeof value.firmwareVersion === 'string'
        ? value.firmwareVersion
        : undefined,
    latestFirmwareVersion:
      typeof value.latestFirmwareVersion === 'string'
        ? value.latestFirmwareVersion
        : undefined,
    firmwareUpdateStatus:
      value.firmwareUpdateStatus === 'idle' ||
      value.firmwareUpdateStatus === 'available' ||
      value.firmwareUpdateStatus === 'updating' ||
      value.firmwareUpdateStatus === 'updated' ||
      value.firmwareUpdateStatus === 'failed'
        ? value.firmwareUpdateStatus
        : undefined,
    firmwareUpdateProgress: isFiniteNumber(value.firmwareUpdateProgress)
      ? value.firmwareUpdateProgress
      : undefined,
    lastSeenAt: readOptionalTimestamp(value.lastSeenAt),
  };
}

function getDefaultStatusForStoredDevice(device: Pick<Device, 'isDemo'>) {
  return device.isDemo ? 'online' : ('offline' as const);
}

function parseStoredDevice(value: unknown, now: number): Device {
  if (!isRecord(value)) {
    throw new Error('DEVICE_STORAGE_INVALID_ITEM');
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.room !== 'string' ||
    !isDeviceType(value.type) ||
    !isOptionalString(value.hardwareId) ||
    !isOptionalString(value.commandToken) ||
    !isOptionalString(value.ipAddress) ||
    (value.isDemo !== undefined && typeof value.isDemo !== 'boolean')
  ) {
    throw new Error('DEVICE_STORAGE_INVALID_SHAPE');
  }

  const registeredAt = readOptionalTimestamp(value.registeredAt) ?? now;
  const growthStartedAt =
    readOptionalTimestamp(value.growthStartedAt) ?? registeredAt;
  const baseDevice = {
    id: value.id,
    hardwareId: value.hardwareId,
    commandToken: value.commandToken,
    isDemo: value.isDemo,
    ipAddress: value.ipAddress,
    registeredAt,
    growthStartedAt,
    name: value.name,
    type: value.type,
    room: value.room,
  };
  const restoredDevice: Device = {
    ...baseDevice,
    status: getDefaultStatusForStoredDevice(baseDevice),
    controls: readLegacyControls(value.controls),
    runtime: readLegacyRuntime(value.runtime),
  };

  return normalizeDeviceLifecycleDates(restoredDevice, now);
}

function parseStoredDevices(value: string, now = Date.now()) {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('DEVICE_STORAGE_INVALID_ROOT');
  }

  return parsed.map(device => parseStoredDevice(device, now));
}

function toStoredDevice(device: Device): StoredDevice {
  return {
    id: device.id,
    hardwareId: device.hardwareId,
    commandToken: device.commandToken,
    isDemo: device.isDemo,
    ipAddress: device.ipAddress,
    registeredAt: device.registeredAt,
    growthStartedAt: device.growthStartedAt,
    name: device.name,
    type: device.type,
    room: device.room,
  };
}

function serializeDevicesForStorage(devices: Device[]) {
  return JSON.stringify(devices.map(toStoredDevice));
}

function mergeLoadedDevices(currentDevices: Device[], loadedDevices: Device[]) {
  if (currentDevices.length === 0) {
    return loadedDevices;
  }

  const nextDevices = [...loadedDevices];

  currentDevices.forEach(currentDevice => {
    const duplicateIndex = nextDevices.findIndex(
      loadedDevice =>
        loadedDevice.id === currentDevice.id ||
        isSamePhysicalDevice(loadedDevice, currentDevice),
    );

    if (duplicateIndex < 0) {
      nextDevices.unshift(currentDevice);
      return;
    }

    nextDevices[duplicateIndex] = {
      ...nextDevices[duplicateIndex],
      ...currentDevice,
    };
  });

  return nextDevices;
}

async function readStorageValueWithRetry(key: string) {
  let latestError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      latestError = error;
    }
  }

  throw latestError instanceof Error
    ? latestError
    : new Error('DEVICE_STORAGE_READ_FAILED');
}

function haveSameAutoNextAnchor(
  currentRuntime: Device['runtime'],
  nextRuntime: NonNullable<Device['runtime']>,
) {
  if (!currentRuntime?.lastSeenAt || !nextRuntime.lastSeenAt) {
    return false;
  }

  const hasCurrentCountdown = currentRuntime.autoNextRunInMs > 0;
  const hasNextCountdown = nextRuntime.autoNextRunInMs > 0;

  if (hasCurrentCountdown !== hasNextCountdown) {
    return false;
  }

  if (!hasCurrentCountdown) {
    return (
      Math.abs(currentRuntime.lastSeenAt - nextRuntime.lastSeenAt) <=
      DEVICE_STATE_ANCHOR_TOLERANCE_MS
    );
  }

  const currentAnchor =
    currentRuntime.lastSeenAt + currentRuntime.autoNextRunInMs;
  const nextAnchor = nextRuntime.lastSeenAt + nextRuntime.autoNextRunInMs;

  return (
    Math.abs(currentAnchor - nextAnchor) <= DEVICE_STATE_ANCHOR_TOLERANCE_MS
  );
}

function areDeviceRuntimesEqual(
  currentRuntime: Device['runtime'],
  nextRuntime: Device['runtime'],
) {
  if (currentRuntime === nextRuntime) {
    return true;
  }

  if (!currentRuntime || !nextRuntime) {
    return false;
  }

  return (
    currentRuntime.autoState === nextRuntime.autoState &&
    currentRuntime.autoRunning === nextRuntime.autoRunning &&
    currentRuntime.autoNextRunInMs === nextRuntime.autoNextRunInMs &&
    currentRuntime.interlockOk === nextRuntime.interlockOk &&
    currentRuntime.fanRunLeftMs === nextRuntime.fanRunLeftMs &&
    currentRuntime.firmwareVersion === nextRuntime.firmwareVersion &&
    currentRuntime.latestFirmwareVersion ===
      nextRuntime.latestFirmwareVersion &&
    currentRuntime.firmwareUpdateStatus ===
      nextRuntime.firmwareUpdateStatus &&
    currentRuntime.firmwareUpdateProgress ===
      nextRuntime.firmwareUpdateProgress &&
    currentRuntime.lastSeenAt === nextRuntime.lastSeenAt
  );
}

function stabilizeRuntimeAnchor(
  currentRuntime: Device['runtime'],
  nextRuntime: NonNullable<Device['runtime']>,
) {
  if (!currentRuntime || !haveSameAutoNextAnchor(currentRuntime, nextRuntime)) {
    return nextRuntime;
  }

  return {
    ...nextRuntime,
    autoNextRunInMs: currentRuntime.autoNextRunInMs,
    lastSeenAt: currentRuntime.lastSeenAt,
  };
}

function mergeDeviceControls(
  currentControls: Device['controls'],
  nextControls: Pick<Device['controls'], 'running' | 'water' | 'fan'>,
) {
  if (
    currentControls.running === nextControls.running &&
    currentControls.water === nextControls.water &&
    currentControls.fan === nextControls.fan
  ) {
    return currentControls;
  }

  return {
    ...currentControls,
    running: nextControls.running,
    water: nextControls.water,
    fan: nextControls.fan,
  };
}

function applyStatusSnapshot(
  device: Device,
  snapshot: DeviceStatusSnapshot,
  now = Date.now(),
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
  const status = snapshot.online ? 'online' : 'offline';
  const controls = mergeDeviceControls(device.controls, {
    running: snapshot.running,
    water: snapshot.water,
    fan: snapshot.fan,
  });
  const runtime = stabilizeRuntimeAnchor(device.runtime, {
    autoState: snapshot.autoState,
    autoRunning: snapshot.autoRunning,
    autoNextRunInMs: snapshot.autoNextRunInMs,
    interlockOk: snapshot.interlockOk,
    fanRunLeftMs: snapshot.fanRunLeftMs,
    firmwareVersion,
    latestFirmwareVersion,
    firmwareUpdateStatus,
    firmwareUpdateProgress,
    lastSeenAt: now,
  });

  if (
    device.status === status &&
    device.controls === controls &&
    areDeviceRuntimesEqual(device.runtime, runtime)
  ) {
    return device;
  }

  return {
    ...device,
    status,
    controls,
    runtime: areDeviceRuntimesEqual(device.runtime, runtime)
      ? device.runtime
      : runtime,
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

    const controls = mergeDeviceControls(device.controls, {
      running: refreshedDevice.controls.running,
      water: refreshedDevice.controls.water,
      fan: refreshedDevice.controls.fan,
    });
    const runtime = refreshedDevice.runtime
      ? stabilizeRuntimeAnchor(device.runtime, refreshedDevice.runtime)
      : refreshedDevice.runtime;

    if (
      device.status === refreshedDevice.status &&
      device.controls === controls &&
      areDeviceRuntimesEqual(device.runtime, runtime)
    ) {
      return device;
    }

    changed = true;
    return {
      ...device,
      status: refreshedDevice.status,
      controls,
      runtime: areDeviceRuntimesEqual(device.runtime, runtime)
        ? device.runtime
        : runtime,
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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [hasLoadedDevices, setHasLoadedDevices] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [persistAttempt, setPersistAttempt] = useState(0);
  const [loadState, setLoadState] = useState<DeviceLoadState>({
    status: 'loading',
  });
  const [persistState, setPersistState] = useState<DevicePersistState>({
    status: 'idle',
  });
  const devicesRef = useRef(devices);
  const canPersistDevicesRef = useRef(false);
  const lastPersistedValueRef = useRef<string | null>(null);
  const pendingPersistValueRef = useRef<string | null>(null);
  const persistDirtyRef = useRef(false);
  const persistInFlightRef = useRef(false);
  const persistStateRef = useRef(persistState);
  const lastDeviceContactAtRef = useRef(new Map<string, number>());

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    persistStateRef.current = persistState;
  }, [persistState]);

  const selectedDevice = useMemo(
    () =>
      selectedDeviceId
        ? devices.find(device => device.id === selectedDeviceId) ?? null
        : null,
    [devices, selectedDeviceId],
  );

  const setSelectedDevice = useCallback((device: Device | null) => {
    setSelectedDeviceId(device?.id ?? null);
  }, []);

  const retryLoadDevices = useCallback(() => {
    setLoadAttempt(current => current + 1);
  }, []);

  const retryPersistDevices = useCallback(() => {
    setPersistAttempt(current => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setHasLoadedDevices(false);
    setLoadState({status: 'loading'});
    canPersistDevicesRef.current = false;

    const loadDevices = async () => {
      let value: string | null;

      try {
        value = await readStorageValueWithRetry(STORAGE_KEY);
      } catch {
        if (cancelled) {
          return;
        }

        setLoadState({
          status: 'error',
          error: 'DEVICE_STORAGE_READ_FAILED',
        });
        setHasLoadedDevices(true);
        return;
      }

      if (cancelled) {
        return;
      }

      if (!value) {
        const emptyStoredDevices = serializeDevicesForStorage([]);
        lastPersistedValueRef.current = emptyStoredDevices;
        canPersistDevicesRef.current = true;
        setLoadState({status: 'loaded'});
        setHasLoadedDevices(true);
        return;
      }

      try {
        const now = Date.now();
        const loadedDevices = parseStoredDevices(value, now);
        lastPersistedValueRef.current = value;
        setDevices(currentDevices =>
          mergeLoadedDevices(currentDevices, loadedDevices),
        );
      } catch {
        let backupSucceeded = false;

        try {
          await AsyncStorage.setItem(CORRUPT_STORAGE_BACKUP_KEY, value);
          backupSucceeded = true;
        } catch {
          if (!cancelled) {
            setPersistState({
              status: 'error',
              error: 'DEVICE_STORAGE_WRITE_FAILED',
            });
          }
        }

        if (cancelled) {
          return;
        }

        if (!backupSucceeded) {
          setLoadState({
            status: 'error',
            error: 'DEVICE_STORAGE_BACKUP_FAILED',
          });
          setHasLoadedDevices(true);
          return;
        }

        lastPersistedValueRef.current = value;
      }

      canPersistDevicesRef.current = true;
      setLoadState({status: 'loaded'});
      setHasLoadedDevices(true);
    };

    loadDevices();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!shouldPersistDevices(hasLoadedDevices, canPersistDevicesRef.current)) {
      return;
    }

    const serializedDevices = serializeDevicesForStorage(devices);

    if (serializedDevices === lastPersistedValueRef.current) {
      pendingPersistValueRef.current = null;
      persistDirtyRef.current = false;

      if (
        !persistInFlightRef.current &&
        persistStateRef.current.status !== 'idle'
      ) {
        setPersistState({status: 'idle'});
      }

      return;
    }

    pendingPersistValueRef.current = serializedDevices;
    persistDirtyRef.current = true;

    if (persistInFlightRef.current) {
      return;
    }

    const valueToPersist = pendingPersistValueRef.current;

    if (!valueToPersist) {
      return;
    }

    persistInFlightRef.current = true;
    setPersistState({status: 'saving'});

    AsyncStorage.setItem(STORAGE_KEY, valueToPersist)
      .then(() => {
        persistInFlightRef.current = false;
        lastPersistedValueRef.current = valueToPersist;

        if (pendingPersistValueRef.current === valueToPersist) {
          pendingPersistValueRef.current = null;
          persistDirtyRef.current = false;
          setPersistState({status: 'idle'});
          return;
        }

        persistDirtyRef.current = true;
        setPersistAttempt(current => current + 1);
      })
      .catch(() => {
        persistInFlightRef.current = false;
        persistDirtyRef.current = true;
        setPersistState({
          status: 'error',
          error: 'DEVICE_STORAGE_WRITE_FAILED',
        });
      });
  }, [devices, hasLoadedDevices, persistAttempt]);

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
          const updateAvailable = hasFirmwareManifestUpdate(
            currentVersion,
            manifest,
          );
          const currentStatus = device.runtime?.firmwareUpdateStatus;
          const nextFirmwareStatus: FirmwareUpdateStatus =
            currentStatus === 'updating' || currentStatus === 'updated'
              ? currentStatus
              : updateAvailable
                ? 'available'
                : currentStatus === 'available'
                  ? 'idle'
                  : currentStatus ?? 'idle';
          const nextLatestFirmwareVersion = hasUsableFirmwareManifest(manifest)
            ? manifest.version
            : device.runtime?.latestFirmwareVersion;

          if (
            device.runtime?.latestFirmwareVersion ===
              nextLatestFirmwareVersion &&
            device.runtime?.firmwareUpdateStatus === nextFirmwareStatus
          ) {
            return device;
          }

          const nextDevice = {
            ...device,
            runtime: {
              ...(device.runtime ?? createEmptyRuntime()),
              latestFirmwareVersion: nextLatestFirmwareVersion,
              firmwareUpdateStatus: nextFirmwareStatus,
            },
          };

          changed = true;
          return nextDevice;
        });

        if (!changed) {
          return currentDevices;
        }

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
          const now = Date.now();
          message.devices?.forEach(deviceId => {
            lastDeviceContactAtRef.current.set(deviceId, now);
          });
          return currentDevices;
        }

        if (
          message.type === 'state' ||
          message.type === 'device_online'
        ) {
          lastDeviceContactAtRef.current.set(message.deviceId, Date.now());
        }

        if (message.type === 'device_offline') {
          lastDeviceContactAtRef.current.delete(message.deviceId);
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
          const lastContactAt = device.hardwareId
            ? lastDeviceContactAtRef.current.get(device.hardwareId)
            : undefined;
          const lastSeenAt = lastContactAt ?? device.runtime?.lastSeenAt;
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
    const existingDevice = devicesRef.current.find(currentDevice =>
      isSamePhysicalDevice(currentDevice, normalizedDevice),
    );
    const selectedId = existingDevice?.id ?? normalizedDevice.id;

    setDevices(current => {
      const duplicateIndex = current.findIndex(existing =>
        isSamePhysicalDevice(existing, normalizedDevice),
      );

      if (duplicateIndex < 0) {
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
      return nextDevices;
    });
    setSelectedDeviceId(selectedId);
  };

  const updateDevice = (id: string, updater: (device: Device) => Device) => {
    setDevices(current =>
      current.map(device => (device.id === id ? updater(device) : device)),
    );
  };

  const removeDevice = (id: string) => {
    const deviceToRemove = devicesRef.current.find(device => device.id === id);

    if (deviceToRemove?.hardwareId) {
      lastDeviceContactAtRef.current.delete(deviceToRemove.hardwareId);
    }

    setDevices(current => current.filter(device => device.id !== id));
    setSelectedDeviceId(current => (current === id ? null : current));
  };

  return {
    devices,
    selectedDevice,
    onlineCount,
    addDevice,
    updateDevice,
    removeDevice,
    setSelectedDevice,
    loadState,
    persistState,
    retryLoadDevices,
    retryPersistDevices,
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

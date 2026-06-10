import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  mergePolledDeviceStatuses,
  shouldPersistDevices,
  useDevices,
} from '../useDevices';
import {Device, DeviceRuntime} from '../types';

let mockDeviceWebSocketListener: ((message: unknown) => void) | undefined;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../deviceCommands', () => ({
  fetchDeviceStatus: jest.fn(),
}));

jest.mock('../deviceWebSocket', () => ({
  reconnectDeviceWebSocket: jest.fn(),
  subscribeDeviceWebSocket: jest.fn(listener => {
    mockDeviceWebSocketListener = listener;
    return jest.fn();
  }),
}));

const idleRuntime: DeviceRuntime = {
  autoState: 'idle',
  autoRunning: false,
  autoNextRunInMs: 0,
  interlockOk: true,
  fanRunLeftMs: 0,
};

function UseDevicesProbe() {
  useDevices();
  return null;
}

function UseDevicesObserver({
  onChange,
}: {
  onChange: (api: ReturnType<typeof useDevices>) => void;
}) {
  const api = useDevices();

  React.useEffect(() => {
    onChange(api);
  }, [api, onChange]);

  return null;
}

type DeviceOverrides = Omit<Partial<Device>, 'controls'> & {
  controls?: Partial<Device['controls']>;
};

function createDevice(overrides: DeviceOverrides = {}): Device {
  const baseDevice: Device = {
    id: 'device-1',
    registeredAt: 1,
    growthStartedAt: 1,
    name: 'Sprout Grower',
    type: 'sprout-grower',
    room: 'Kitchen',
    status: 'online',
    controls: {
      water: false,
      fan: false,
      cleanMode: false,
      running: false,
    },
  };

  return {
    ...baseDevice,
    ...overrides,
    controls: {
      ...baseDevice.controls,
      ...overrides.controls,
    },
  };
}

describe('mergePolledDeviceStatuses', () => {
  it('merges polled status without replacing the current device list', () => {
    const localDevice = createDevice({
      id: 'local-device',
      name: 'Kitchen Sprouter',
      ipAddress: '192.168.0.10',
      controls: {
        cleanMode: true,
      },
      runtime: idleRuntime,
    });
    const websocketDevice = createDevice({
      id: 'websocket-device',
      hardwareId: 'HW-1',
      status: 'online',
      controls: {
        running: true,
      },
    });
    const addedAfterPollStarted = createDevice({
      id: 'added-after-poll',
      status: 'setup',
      ipAddress: '192.168.0.20',
    });
    const refreshedRuntime: DeviceRuntime = {
      ...idleRuntime,
      autoState: 'watering',
      autoRunning: true,
      lastSeenAt: 10,
    };
    const refreshedLocalDevice = createDevice({
      id: 'local-device',
      name: 'Outdated Poll Name',
      status: 'offline',
      controls: {
        running: true,
        water: true,
        fan: true,
        cleanMode: false,
      },
      runtime: refreshedRuntime,
    });
    const refreshedWebsocketDevice = createDevice({
      id: 'websocket-device',
      status: 'offline',
      controls: {
        running: false,
      },
    });

    const nextDevices = mergePolledDeviceStatuses(
      [localDevice, websocketDevice, addedAfterPollStarted],
      new Map([
        [refreshedLocalDevice.id, refreshedLocalDevice],
        [refreshedWebsocketDevice.id, refreshedWebsocketDevice],
      ]),
    );

    expect(nextDevices.map(device => device.id)).toEqual([
      'local-device',
      'websocket-device',
      'added-after-poll',
    ]);
    expect(nextDevices[0]).toMatchObject({
      id: 'local-device',
      name: 'Kitchen Sprouter',
      status: 'offline',
      controls: {
        running: true,
        water: true,
        fan: true,
        cleanMode: true,
      },
      runtime: refreshedRuntime,
    });
    expect(nextDevices[1]).toBe(websocketDevice);
    expect(nextDevices[2]).toBe(addedAfterPollStarted);
  });

  it('returns the same list when no polled status applies', () => {
    const devices = [
      createDevice({id: 'websocket-device', hardwareId: 'HW-1'}),
      createDevice({id: 'new-device', status: 'setup'}),
    ];

    const nextDevices = mergePolledDeviceStatuses(
      devices,
      new Map([
        [
          'websocket-device',
          createDevice({id: 'websocket-device', status: 'offline'}),
        ],
      ]),
    );

    expect(nextDevices).toBe(devices);
  });

  it('keeps the same list when only the countdown anchor is equivalent', () => {
    const localDevice = createDevice({
      id: 'local-device',
      ipAddress: '192.168.0.10',
      runtime: {
        ...idleRuntime,
        autoNextRunInMs: 10_000,
        lastSeenAt: 1_000,
      },
    });
    const devices = [localDevice];
    const refreshedLocalDevice = createDevice({
      id: 'local-device',
      status: 'online',
      ipAddress: '192.168.0.10',
      runtime: {
        ...idleRuntime,
        autoNextRunInMs: 9_000,
        lastSeenAt: 2_000,
      },
    });

    const nextDevices = mergePolledDeviceStatuses(
      devices,
      new Map([[refreshedLocalDevice.id, refreshedLocalDevice]]),
    );

    expect(nextDevices).toBe(devices);
  });
});

describe('shouldPersistDevices', () => {
  it('does not allow persistence before stored devices finish loading', () => {
    expect(shouldPersistDevices(false, false)).toBe(false);
    expect(shouldPersistDevices(false, true)).toBe(false);
  });

  it('does not allow persistence after storage loading fails', () => {
    expect(shouldPersistDevices(true, false)).toBe(false);
  });

  it('allows persistence only after storage loads successfully', () => {
    expect(shouldPersistDevices(true, true)).toBe(true);
  });
});

describe('useDevices device contact freshness', () => {
  const asyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    jest.clearAllMocks();
    mockDeviceWebSocketListener = undefined;
    asyncStorage.getItem.mockResolvedValue(null);
    asyncStorage.setItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not mark an online device stale when websocket contact is fresh but the countdown anchor is frozen', async () => {
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'cloud-device',
          hardwareId: 'HW-1',
          status: 'offline',
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      jest.setSystemTime(1_000);
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
        state: {
          sta_connected: true,
          system_enabled: true,
          interlock_ok: true,
          pump_on: false,
          fan_on: false,
          auto_state: 0,
          auto_next_run_in_ms: 100_000,
        },
      });
    });

    await ReactTestRenderer.act(async () => {
      jest.setSystemTime(11_000);
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
        state: {
          sta_connected: true,
          system_enabled: true,
          interlock_ok: true,
          pump_on: false,
          fan_on: false,
          auto_state: 0,
          auto_next_run_in_ms: 90_000,
        },
      });
    });

    expect(latestApi?.devices[0].runtime?.lastSeenAt).toBe(1_000);

    await ReactTestRenderer.act(async () => {
      jest.setSystemTime(20_000);
      jest.advanceTimersByTime(5_000);
    });

    expect(latestApi?.devices[0].status).toBe('online');

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('ignores malformed websocket state frames without replacing devices', async () => {
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'cloud-device',
          hardwareId: 'HW-1',
          status: 'online',
        }),
      );
    });

    const previousDevices = latestApi?.devices;

    expect(() => {
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
      });
    }).not.toThrow();

    expect(latestApi?.devices).toBe(previousDevices);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('keeps the same device array for equivalent websocket state snapshots', async () => {
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'cloud-device',
          hardwareId: 'HW-1',
          status: 'offline',
        }),
      );
    });

    const state = {
      sta_connected: true,
      system_enabled: true,
      interlock_ok: true,
      pump_on: false,
      fan_on: false,
      auto_state: 0,
      auto_next_run_in_ms: 60_000,
    };

    await ReactTestRenderer.act(async () => {
      jest.setSystemTime(1_000);
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
        state,
      });
    });

    const previousDevices = latestApi?.devices;

    await ReactTestRenderer.act(async () => {
      jest.setSystemTime(1_000);
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
        state,
      });
    });

    expect(latestApi?.devices).toBe(previousDevices);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('normalizes invalid websocket numeric fields instead of storing NaN', async () => {
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'cloud-device',
          hardwareId: 'HW-1',
          status: 'offline',
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      mockDeviceWebSocketListener?.({
        type: 'state',
        deviceId: 'HW-1',
        state: {
          sta_connected: true,
          auto_state: 'invalid',
          auto_next_run_in_ms: 'invalid',
          fan_run_left_ms: 'invalid',
          update_progress: 'invalid',
        },
      });
    });

    const runtime = latestApi?.devices[0].runtime;

    expect(Number.isNaN(runtime?.autoNextRunInMs)).toBe(false);
    expect(Number.isNaN(runtime?.fanRunLeftMs)).toBe(false);
    expect(Number.isNaN(runtime?.firmwareUpdateProgress)).toBe(false);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });
});

describe('useDevices persistence', () => {
  const asyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDeviceWebSocketListener = undefined;
    asyncStorage.setItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not persist an empty device list before stored devices finish loading', async () => {
    let resolveGetItem: (value: string | null) => void = () => undefined;
    asyncStorage.getItem.mockReturnValue(
      new Promise(resolve => {
        resolveGetItem = resolve;
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(UseDevicesProbe));
    });

    expect(asyncStorage.getItem).toHaveBeenCalledWith('smart_devices_v1');
    expect(asyncStorage.setItem).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      resolveGetItem(null);
    });

    expect(asyncStorage.setItem).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('does not persist devices when stored device loading fails', async () => {
    asyncStorage.getItem.mockRejectedValue(new Error('storage unavailable'));

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(UseDevicesProbe));
    });

    await ReactTestRenderer.act(async () => undefined);

    expect(asyncStorage.setItem).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('does not overwrite corrupt storage when the backup write fails', async () => {
    asyncStorage.getItem.mockResolvedValue('not-json');
    asyncStorage.setItem.mockRejectedValueOnce(new Error('backup failed'));

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(UseDevicesProbe));
    });

    await ReactTestRenderer.act(async () => undefined);

    expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1_corrupt_backup',
      'not-json',
    );

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('persists only durable device fields after a device is added', async () => {
    asyncStorage.getItem.mockResolvedValue(null);
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    asyncStorage.setItem.mockClear();

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'device-persisted',
          hardwareId: 'HW-1',
          commandToken: 'token-1',
          ipAddress: '192.168.0.10',
          status: 'online',
          controls: {
            running: true,
            water: true,
            fan: true,
          },
          runtime: {
            ...idleRuntime,
            firmwareVersion: '1.0.7',
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => undefined);

    const setItemCalls = asyncStorage.setItem.mock.calls;
    const persistedPayload = JSON.parse(
      setItemCalls[setItemCalls.length - 1]?.[1] ?? '[]',
    );

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1',
      expect.any(String),
    );
    expect(persistedPayload).toEqual([
      {
        id: 'device-persisted',
        hardwareId: 'HW-1',
        commandToken: 'token-1',
        ipAddress: '192.168.0.10',
        registeredAt: 1,
        growthStartedAt: 1,
        name: 'Sprout Grower',
        type: 'sprout-grower',
        room: 'Kitchen',
      },
    ]);
    expect(persistedPayload[0].status).toBeUndefined();
    expect(persistedPayload[0].controls).toBeUndefined();
    expect(persistedPayload[0].runtime).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('does not persist demo devices', async () => {
    asyncStorage.getItem.mockResolvedValue(null);
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    asyncStorage.setItem.mockClear();

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(
        createDevice({
          id: 'demo-device',
          isDemo: true,
        }),
      );
    });

    await ReactTestRenderer.act(async () => undefined);

    expect(asyncStorage.setItem).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('skips previously stored demo devices on load', async () => {
    asyncStorage.getItem.mockResolvedValue(
      JSON.stringify([
        createDevice({
          id: 'stored-demo',
          isDemo: true,
        }),
      ]),
    );
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => undefined);

    expect(latestApi?.devices).toEqual([]);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('recovers valid stored devices while backing up corrupt stored items', async () => {
    const storedValue = JSON.stringify([
      createDevice({
        id: 'stored-device',
        hardwareId: 'HW-STORED',
      }),
      {id: 'corrupt-device'},
    ]);
    asyncStorage.getItem.mockResolvedValue(storedValue);
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });
    await ReactTestRenderer.act(async () => undefined);

    expect(latestApi?.devices.map(device => device.id)).toEqual([
      'stored-device',
    ]);
    expect(latestApi?.loadState).toEqual({
      status: 'loaded',
      warning: 'DEVICE_STORAGE_RECOVERED_WITH_BACKUP',
    });
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1_corrupt_backup',
      storedValue,
    );
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1',
      expect.not.stringContaining('corrupt-device'),
    );

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('rewrites storage when an in-flight add write is followed by deletion', async () => {
    asyncStorage.getItem.mockResolvedValue(null);
    let finishFirstWrite: () => void = () => undefined;
    asyncStorage.setItem.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishFirstWrite = resolve;
        }),
    );
    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(createDevice({id: 'transient-device'}));
    });

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1',
      expect.stringContaining('transient-device'),
    );

    await ReactTestRenderer.act(async () => {
      latestApi?.removeDevice('transient-device');
    });

    expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      finishFirstWrite();
    });
    await ReactTestRenderer.act(async () => undefined);

    expect(asyncStorage.setItem).toHaveBeenLastCalledWith(
      'smart_devices_v1',
      JSON.stringify([]),
    );

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('merges stored devices with devices added while loading was unavailable', async () => {
    const storedDevice = createDevice({
      id: 'stored-device',
      hardwareId: 'HW-STORED',
      status: 'online',
    });
    const sessionDevice = createDevice({
      id: 'session-device',
      hardwareId: 'HW-SESSION',
      commandToken: 'session-token',
    });

    asyncStorage.getItem
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(JSON.stringify([storedDevice]));

    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => undefined);
    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(sessionDevice);
    });

    expect(asyncStorage.setItem).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      latestApi?.retryLoadDevices();
    });
    await ReactTestRenderer.act(async () => undefined);

    const deviceIds = latestApi?.devices.map(device => device.id).sort();

    expect(deviceIds).toEqual(['session-device', 'stored-device']);
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1',
      expect.stringContaining('session-device'),
    );

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  it('preserves stored identity fields when a session device has undefined values', async () => {
    const storedDevice = createDevice({
      id: 'same-device',
      hardwareId: 'HW-STORED',
      commandToken: 'stored-token',
      ipAddress: '192.168.0.10',
    });
    const sessionDevice = createDevice({
      id: 'same-device',
      hardwareId: undefined,
      commandToken: undefined,
      ipAddress: undefined,
    });

    asyncStorage.getItem
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(JSON.stringify([storedDevice]));

    let latestApi: ReturnType<typeof useDevices> | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(UseDevicesObserver, {
          onChange: api => {
            latestApi = api;
          },
        }),
      );
    });

    await ReactTestRenderer.act(async () => undefined);
    await ReactTestRenderer.act(async () => {
      latestApi?.addDevice(sessionDevice);
    });
    await ReactTestRenderer.act(async () => {
      latestApi?.retryLoadDevices();
    });
    await ReactTestRenderer.act(async () => undefined);

    expect(latestApi?.devices[0]).toMatchObject({
      id: 'same-device',
      hardwareId: 'HW-STORED',
      commandToken: 'stored-token',
      ipAddress: '192.168.0.10',
    });

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });
});

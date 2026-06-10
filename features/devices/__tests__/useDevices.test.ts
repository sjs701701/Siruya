import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  mergePolledDeviceStatuses,
  shouldPersistDevices,
  useDevices,
} from '../useDevices';
import {Device, DeviceRuntime} from '../types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../deviceCommands', () => ({
  fetchDeviceStatus: jest.fn(),
}));

jest.mock('../deviceWebSocket', () => ({
  reconnectDeviceWebSocket: jest.fn(),
  subscribeDeviceWebSocket: jest.fn(() => jest.fn()),
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

describe('useDevices persistence', () => {
  const asyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      'smart_devices_v1',
      JSON.stringify([]),
    );

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
});

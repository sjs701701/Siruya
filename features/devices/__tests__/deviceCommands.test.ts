jest.mock('../deviceWebSocket', () => ({
  sendWebSocketDeviceCommand: jest.fn(),
}));

import {
  fetchDeviceStatus,
  sendDeviceCommand,
  sendDeviceSprayCycleCommand,
  sendFirmwareUpdateCommand,
} from '../deviceCommands';
import {sendWebSocketDeviceCommand} from '../deviceWebSocket';
import {Device} from '../types';

const sendWebSocketDeviceCommandMock =
  sendWebSocketDeviceCommand as jest.MockedFunction<
    typeof sendWebSocketDeviceCommand
  >;

function createDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-1',
    commandToken: 'command-token-1',
    registeredAt: 1,
    growthStartedAt: 1,
    name: 'Sprout Grower',
    type: 'sprout-grower',
    room: 'Kitchen',
    status: 'online',
    ipAddress: '192.168.0.10',
    controls: {
      power: false,
      water: false,
      fan: false,
      cleanMode: false,
      running: false,
    },
    ...overrides,
  };
}

function mockCommandResponse() {
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve('{"ok":true}'),
  } as Response);
}

describe('deviceCommands', () => {
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    sendWebSocketDeviceCommandMock.mockResolvedValue(undefined);
    fetchMock.mockImplementation(mockCommandResponse);
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends the per-device command token with local commands', async () => {
    await sendDeviceCommand({
      device: createDevice(),
      command: 'water',
      value: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.10/command',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'water',
          token: 'command-token-1',
          value: true,
        }),
      }),
    );
  });

  it('sends power commands through the same authenticated command route', async () => {
    await sendDeviceCommand({
      device: createDevice(),
      command: 'power',
      value: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.10/command',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'power',
          token: 'command-token-1',
          value: true,
        }),
      }),
    );
  });

  it('sends the per-device command token with local firmware update commands', async () => {
    await sendFirmwareUpdateCommand(createDevice());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.10/command',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'firmwareUpdate',
          token: 'command-token-1',
          value: true,
        }),
      }),
    );
  });

  it('sends spray cycle minutes through the authenticated command route', async () => {
    await sendDeviceSprayCycleCommand({
      device: createDevice(),
      minutes: 45,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.10/command',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'sprayCycle',
          token: 'command-token-1',
          value: 45,
        }),
      }),
    );
  });

  it('uses the local command route before websocket for hardware devices', async () => {
    await sendDeviceCommand({
      device: createDevice({hardwareId: 'HW-1'}),
      command: 'fan',
      value: true,
    });

    expect(sendWebSocketDeviceCommandMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.0.10/command',
      expect.objectContaining({
        body: JSON.stringify({
          command: 'fan',
          token: 'command-token-1',
          value: true,
        }),
      }),
    );
  });

  it('uses websocket directly when a hardware device has no local IP route', async () => {
    const device = createDevice({hardwareId: 'HW-1', ipAddress: undefined});

    await sendDeviceCommand({
      device,
      command: 'fan',
      value: true,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendWebSocketDeviceCommandMock).toHaveBeenCalledWith({
      device,
      command: 'fan',
      value: true,
    });
  });

  it('falls back to websocket when the local command route fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('NETWORK_FAILED'));

    await sendDeviceCommand({
      device: createDevice({hardwareId: 'HW-1'}),
      command: 'fan',
      value: true,
    });

    expect(sendWebSocketDeviceCommandMock).toHaveBeenCalledWith({
      device: createDevice({hardwareId: 'HW-1'}),
      command: 'fan',
      value: true,
    });
  });

  it('fails before sending a command when the command token is missing', async () => {
    await expect(
      sendDeviceCommand({
        device: createDevice({commandToken: undefined}),
        command: 'water',
        value: true,
      }),
    ).rejects.toThrow('DEVICE_COMMAND_TOKEN_MISSING');

    expect(sendWebSocketDeviceCommandMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails before sending a command when the local IP is missing', async () => {
    await expect(
      sendDeviceCommand({
        device: createDevice({ipAddress: undefined}),
        command: 'water',
        value: true,
      }),
    ).rejects.toThrow('DEVICE_COMMAND_ROUTE_MISSING');

    expect(sendWebSocketDeviceCommandMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps power support from device status responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            power_enabled: true,
            system_enabled: true,
            sta_connected: true,
            interlock_ok: true,
            pump_on: false,
            fan_on: true,
            auto_state: 0,
            auto_cycle_ms: 2700000,
            auto_next_run_in_ms: 120000,
            fan_run_left_ms: 30000,
            firmware_version: '1.0.8',
          }),
        ),
    } as Response);

    const snapshot = await fetchDeviceStatus(createDevice());

    expect(snapshot).toMatchObject({
      online: true,
      power: true,
      powerControlSupported: true,
      running: true,
      fan: true,
      autoCycleMs: 2700000,
      firmwareVersion: '1.0.8',
    });
  });

  it('keeps power undefined for firmware without power status support', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            system_enabled: true,
            sta_connected: true,
            interlock_ok: true,
            pump_on: false,
            fan_on: false,
            auto_state: 0,
          }),
        ),
    } as Response);

    const snapshot = await fetchDeviceStatus(createDevice());

    expect(snapshot.power).toBeUndefined();
    expect(snapshot.powerControlSupported).toBe(false);
  });
});

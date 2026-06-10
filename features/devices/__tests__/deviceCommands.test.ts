import {sendDeviceCommand, sendFirmwareUpdateCommand} from '../deviceCommands';
import {Device} from '../types';

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
});

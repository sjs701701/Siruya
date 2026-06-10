import {Device} from '../types';

const createdSockets: MockDeviceWebSocket[] = [];
let originalWebSocket: unknown;

class MockDeviceWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly url: string;
  readyState = MockDeviceWebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data: string}) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    createdSockets.push(this);
  }

  send(message: string) {
    this.sentMessages.push(message);
  }

  close() {
    this.readyState = MockDeviceWebSocket.CLOSED;
  }

  open() {
    this.readyState = MockDeviceWebSocket.OPEN;
    this.onopen?.();
  }

  closeWithEvent() {
    this.readyState = MockDeviceWebSocket.CLOSED;
    this.onclose?.();
  }
}

function createDevice(overrides: Partial<Device> = {}): Device {
  return {
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
    ...overrides,
  };
}

describe('deviceWebSocket', () => {
  beforeEach(() => {
    jest.resetModules();
    createdSockets.length = 0;
    originalWebSocket = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockDeviceWebSocket,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  });

  it('keeps new socket waiters alive when the previous socket closes after reconnect', async () => {
    const {
      ensureDeviceWebSocket,
      reconnectDeviceWebSocket,
      sendWebSocketDeviceCommand,
    } = require('../deviceWebSocket') as typeof import('../deviceWebSocket');

    const firstSocket = ensureDeviceWebSocket() as unknown as MockDeviceWebSocket;
    const secondSocket =
      reconnectDeviceWebSocket() as unknown as MockDeviceWebSocket;

    expect(createdSockets).toHaveLength(2);
    expect(secondSocket).not.toBe(firstSocket);

    const commandPromise = sendWebSocketDeviceCommand({
      device: createDevice({commandToken: 'command-token-1'}),
      command: 'water',
      value: true,
    });

    firstSocket.closeWithEvent();
    secondSocket.open();

    await commandPromise;
    expect(secondSocket.sentMessages).toEqual([
      JSON.stringify({type: 'app_hello'}),
      JSON.stringify({
        type: 'command',
        deviceId: 'device-1',
        command: 'water',
        token: 'command-token-1',
        value: true,
      }),
    ]);
  });
});

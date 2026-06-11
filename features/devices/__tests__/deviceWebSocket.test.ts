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
      power: false,
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
    jest.useRealTimers();
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

  it('uses recent websocket contact instead of stale runtime lastSeenAt before sending a command', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(20_000);
    const {ensureDeviceWebSocket, sendWebSocketDeviceCommand} =
      require('../deviceWebSocket') as typeof import('../deviceWebSocket');

    const socket = ensureDeviceWebSocket() as unknown as MockDeviceWebSocket;
    socket.open();
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'state',
        deviceId: 'HW-1',
        state: {
          sta_connected: true,
        },
      }),
    });

    const commandPromise = sendWebSocketDeviceCommand({
      device: createDevice({
        hardwareId: 'HW-1',
        commandToken: 'command-token-1',
        runtime: {
          autoState: 'idle',
          autoRunning: true,
          autoNextRunInMs: 100_000,
          interlockOk: true,
          fanRunLeftMs: 0,
          lastSeenAt: 1_000,
        },
      }),
      command: 'water',
      value: true,
    });

    await Promise.resolve();

    expect(createdSockets).toHaveLength(1);
    expect(socket.sentMessages).toContain(
      JSON.stringify({
        type: 'command',
        deviceId: 'HW-1',
        command: 'water',
        token: 'command-token-1',
        value: true,
      }),
    );

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'state',
        deviceId: 'HW-1',
        state: {
          sta_connected: true,
        },
      }),
    });

    await commandPromise;
  });

  it('ignores malformed server messages before notifying subscribers', () => {
    const {ensureDeviceWebSocket, subscribeDeviceWebSocket} =
      require('../deviceWebSocket') as typeof import('../deviceWebSocket');
    const listener = jest.fn();

    subscribeDeviceWebSocket(listener);
    const socket = ensureDeviceWebSocket() as unknown as MockDeviceWebSocket;
    socket.open();

    socket.onmessage?.({data: JSON.stringify({type: 'state'})});
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'state',
        deviceId: 'HW-1',
        state: null,
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'hello_ok',
        devices: [null],
      }),
    });

    expect(listener).not.toHaveBeenCalled();
  });
});

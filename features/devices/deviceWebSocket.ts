import {Device, DeviceCommand} from './types';

export const DEVICE_WS_URL = 'wss://mqtt.app2-server.kr/ws';
const DEVICE_CONTACT_STALE_MS = 15000;

export type DeviceWsState = {
  power_enabled?: boolean;
  system_enabled?: boolean;
  sta_connected?: boolean;
  interlock_ok?: boolean;
  pump_on?: boolean;
  pump_req_app?: boolean;
  pump_req_auto?: boolean;
  fan_on?: boolean;
  fan_run_left_ms?: number;
  auto_state?: number;
  auto_next_run_in_ms?: number;
  auto_immediate_pending?: boolean;
  firmware_version?: string;
  latest_firmware_version?: string;
  update_available?: boolean;
  update_status?: string;
  update_progress?: number;
};

export type DeviceWsMessage =
  | {type: 'hello_ok'; devices?: string[]}
  | {type: 'device_online'; deviceId: string}
  | {type: 'device_offline'; deviceId: string}
  | {type: 'state'; deviceId: string; state: DeviceWsState}
  | {type: 'command_error'; deviceId: string; message?: string};

type Listener = (message: DeviceWsMessage) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();
const openWaiters = new Set<{
  resolve: () => void;
  reject: (error: Error) => void;
}>();
const deviceWaiters = new Map<
  string,
  Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>
>();
const commandWaiters = new Map<
  string,
  Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>
>();
const deviceLastContactAtById = new Map<string, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDeviceWsMessage(value: unknown): DeviceWsMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'hello_ok') {
    if (
      value.devices !== undefined &&
      (!Array.isArray(value.devices) ||
        !value.devices.every(deviceId => typeof deviceId === 'string'))
    ) {
      return null;
    }

    return {
      type: 'hello_ok',
      devices: value.devices,
    };
  }

  if (
    value.type === 'device_online' ||
    value.type === 'device_offline'
  ) {
    return typeof value.deviceId === 'string'
      ? {
          type: value.type,
          deviceId: value.deviceId,
        }
      : null;
  }

  if (value.type === 'state') {
    return typeof value.deviceId === 'string' && isRecord(value.state)
      ? {
          type: 'state',
          deviceId: value.deviceId,
          state: value.state,
        }
      : null;
  }

  if (value.type === 'command_error') {
    return typeof value.deviceId === 'string'
      ? {
          type: 'command_error',
          deviceId: value.deviceId,
          message:
            typeof value.message === 'string' ? value.message : undefined,
        }
      : null;
  }

  return null;
}

function rememberDeviceContact(message: DeviceWsMessage, now = Date.now()) {
  if (message.type === 'hello_ok') {
    message.devices?.forEach(deviceId => {
      deviceLastContactAtById.set(deviceId, now);
    });
    return;
  }

  if (message.type === 'state' || message.type === 'device_online') {
    deviceLastContactAtById.set(message.deviceId, now);
    return;
  }

  if (message.type === 'device_offline') {
    deviceLastContactAtById.delete(message.deviceId);
  }
}

function getLastDeviceContactAt(device: Device) {
  const deviceId = device.hardwareId ?? device.id;
  const socketContactAt = deviceLastContactAtById.get(deviceId);
  const runtimeContactAt = device.runtime?.lastSeenAt;

  if (socketContactAt && runtimeContactAt) {
    return Math.max(socketContactAt, runtimeContactAt);
  }

  return socketContactAt ?? runtimeContactAt;
}

function emit(message: DeviceWsMessage) {
  rememberDeviceContact(message);

  if (message.type === 'state') {
    const waiters = commandWaiters.get(message.deviceId);

    if (waiters) {
      waiters.forEach(waiter => waiter.resolve());
      commandWaiters.delete(message.deviceId);
    }
  }

  if (message.type === 'command_error') {
    const waiters = commandWaiters.get(message.deviceId);

    if (waiters) {
      waiters.forEach(waiter =>
        waiter.reject(new Error(message.message ?? 'COMMAND_FAILED')),
      );
      commandWaiters.delete(message.deviceId);
    }
  }

  if (
    message.type === 'state' ||
    message.type === 'device_online' ||
    message.type === 'hello_ok'
  ) {
    const onlineDeviceIds =
      message.type === 'hello_ok'
        ? message.devices ?? []
        : [message.deviceId];

    onlineDeviceIds.forEach(deviceId => {
      const waiters = deviceWaiters.get(deviceId);

      if (!waiters) {
        return;
      }

      waiters.forEach(waiter => waiter.resolve());
      deviceWaiters.delete(deviceId);
    });
  }

  if (message.type === 'device_offline') {
    const waiters = deviceWaiters.get(message.deviceId);

    if (waiters) {
      waiters.forEach(waiter => waiter.reject(new Error('DEVICE_OFFLINE')));
      deviceWaiters.delete(message.deviceId);
    }

    const commandWaitersForDevice = commandWaiters.get(message.deviceId);

    if (commandWaitersForDevice) {
      commandWaitersForDevice.forEach(waiter =>
        waiter.reject(new Error('DEVICE_OFFLINE')),
      );
      commandWaiters.delete(message.deviceId);
    }
  }

  listeners.forEach(listener => listener(message));
}

function sendAppHello() {
  if (socket?.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({type: 'app_hello'}));
}

function notifyOpenWaiters() {
  openWaiters.forEach(waiter => waiter.resolve());
  openWaiters.clear();
}

function rejectOpenWaiters(error: Error) {
  openWaiters.forEach(waiter => waiter.reject(error));
  openWaiters.clear();
}

function waitForDeviceOnline(deviceId: string, timeoutMs = 7000) {
  return new Promise<void>((resolve, reject) => {
    const waiter = {resolve: done, reject: fail};
    const timeout = setTimeout(() => {
      const waiters = deviceWaiters.get(deviceId);
      waiters?.delete(waiter);

      if (waiters?.size === 0) {
        deviceWaiters.delete(deviceId);
      }

      fail(new Error('DEVICE_STALE'));
    }, timeoutMs);

    function done() {
      clearTimeout(timeout);
      resolve();
    }

    function fail(error: Error) {
      clearTimeout(timeout);
      reject(error);
    }

    const waiters = deviceWaiters.get(deviceId) ?? new Set();
    waiters.add(waiter);
    deviceWaiters.set(deviceId, waiters);
    sendAppHello();
  });
}

function waitForCommandState(deviceId: string, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    const waiter = {resolve: done, reject: fail};
    const timeout = setTimeout(() => {
      const waiters = commandWaiters.get(deviceId);
      waiters?.delete(waiter);

      if (waiters?.size === 0) {
        commandWaiters.delete(deviceId);
      }

      fail(new Error('COMMAND_TIMEOUT'));
    }, timeoutMs);

    function done() {
      clearTimeout(timeout);
      resolve();
    }

    function fail(error: Error) {
      clearTimeout(timeout);
      reject(error);
    }

    const waiters = commandWaiters.get(deviceId) ?? new Set();
    waiters.add(waiter);
    commandWaiters.set(deviceId, waiters);
  });
}

function waitForSocketOpen(currentSocket: WebSocket, timeoutMs = 5000) {
  if (currentSocket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  if (currentSocket.readyState !== WebSocket.CONNECTING) {
    return Promise.reject(new Error('WS_NOT_CONNECTED'));
  }

  return new Promise<void>((resolve, reject) => {
    const waiter = {resolve: done, reject: fail};
    const timeout = setTimeout(() => {
      openWaiters.delete(waiter);
      fail(new Error('WS_NOT_CONNECTED'));
    }, timeoutMs);

    function done() {
      clearTimeout(timeout);
      resolve();
    }

    function fail(error: Error) {
      clearTimeout(timeout);
      reject(error);
    }

    openWaiters.add(waiter);
  });
}

export function ensureDeviceWebSocket() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return socket;
  }

  const nextSocket = new WebSocket(DEVICE_WS_URL);
  socket = nextSocket;

  nextSocket.onopen = () => {
    sendAppHello();
    notifyOpenWaiters();
  };

  nextSocket.onmessage = event => {
    try {
      const message = parseDeviceWsMessage(JSON.parse(String(event.data)));

      if (message) {
        emit(message);
      }
    } catch {
      // Ignore malformed server messages.
    }
  };

  nextSocket.onclose = () => {
    if (socket !== nextSocket) {
      return;
    }

    socket = null;
    rejectOpenWaiters(new Error('WS_NOT_CONNECTED'));

    if (reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureDeviceWebSocket();
    }, 3000);
  };

  nextSocket.onerror = () => {
    nextSocket.close();
  };

  return socket;
}

export function reconnectDeviceWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const previousSocket = socket;
  socket = null;
  previousSocket?.close();
  return ensureDeviceWebSocket();
}

export function subscribeDeviceWebSocket(listener: Listener) {
  listeners.add(listener);
  ensureDeviceWebSocket();

  return () => {
    listeners.delete(listener);
  };
}

export async function sendWebSocketDeviceCommand(params: {
  device: Device;
  command: DeviceCommand | 'firmwareUpdate';
  value: boolean;
}) {
  const deviceId = params.device.hardwareId ?? params.device.id;
  const lastSeenAt = getLastDeviceContactAt(params.device);
  const shouldRefreshSocket =
    Boolean(params.device.hardwareId) &&
    (!lastSeenAt || Date.now() - lastSeenAt > DEVICE_CONTACT_STALE_MS);
  const currentSocket = shouldRefreshSocket
    ? reconnectDeviceWebSocket()
    : ensureDeviceWebSocket();

  await waitForSocketOpen(currentSocket);

  if (params.device.hardwareId && shouldRefreshSocket) {
    await waitForDeviceOnline(deviceId);
  }

  const commandState = params.device.hardwareId
    ? waitForCommandState(deviceId)
    : undefined;

  currentSocket.send(
    JSON.stringify({
      type: 'command',
      deviceId,
      command: params.command,
      token: params.device.commandToken,
      value: params.value,
    }),
  );

  await commandState;
}

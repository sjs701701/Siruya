import {
  Device,
  DeviceAutoState,
  DeviceCommand,
  FirmwareUpdateStatus,
} from './types';
import {sendWebSocketDeviceCommand} from './deviceWebSocket';

export type DeviceCommandResponse = {
  ok?: boolean;
  message?: string;
};

type Esp32StatusResponse = {
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

export type DeviceStatusSnapshot = {
  online: boolean;
  running: boolean;
  water: boolean;
  fan: boolean;
  autoState: DeviceAutoState;
  autoRunning: boolean;
  autoNextRunInMs: number;
  interlockOk: boolean;
  fanRunLeftMs: number;
  firmwareVersion?: string;
  latestFirmwareVersion?: string;
  firmwareUpdateStatus?: FirmwareUpdateStatus;
  firmwareUpdateProgress?: number;
};

function getDeviceBaseUrl(device: Device) {
  if (!device.ipAddress) {
    throw new Error('DEVICE_IP_MISSING');
  }

  if (device.ipAddress.startsWith('http://') || device.ipAddress.startsWith('https://')) {
    return device.ipAddress.replace(/\/$/, '');
  }

  return `http://${device.ipAddress}`;
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

function autoStateFromEsp32(autoState?: number): DeviceAutoState {
  if (autoState === 1) {
    return 'preparing';
  }

  if (autoState === 2) {
    return 'watering';
  }

  return 'idle';
}

export async function sendDeviceCommand(params: {
  device: Device;
  command: DeviceCommand;
  value: boolean;
}) {
  if (params.device.hardwareId) {
    await sendWebSocketDeviceCommand(params);
    return {ok: true};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${getDeviceBaseUrl(params.device)}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: params.command,
        value: params.value,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as DeviceCommandResponse) : {};

    if (!response.ok || data.ok === false) {
      throw new Error(data.message ?? `COMMAND_FAILED_${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDeviceStatus(
  device: Device,
): Promise<DeviceStatusSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${getDeviceBaseUrl(device)}/status`, {
      method: 'GET',
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as Esp32StatusResponse) : {};

    if (!response.ok) {
      throw new Error(`STATUS_FAILED_${response.status}`);
    }

    const autoState = autoStateFromEsp32(data.auto_state);
    const autoRunning =
      Boolean(data.pump_req_auto) ||
      autoState === 'preparing' ||
      autoState === 'watering';

    return {
      online: Boolean(data.sta_connected),
      running: Boolean(data.system_enabled),
      water: Boolean(data.pump_on),
      fan: Boolean(data.fan_on),
      autoState,
      autoRunning,
      autoNextRunInMs: Number(data.auto_next_run_in_ms ?? 0),
      interlockOk: Boolean(data.interlock_ok),
      fanRunLeftMs: Number(data.fan_run_left_ms ?? 0),
      firmwareVersion: data.firmware_version,
      latestFirmwareVersion: data.latest_firmware_version,
      firmwareUpdateStatus: normalizeFirmwareStatus(
        data.update_status,
        data.update_available,
      ),
      firmwareUpdateProgress: Number(data.update_progress ?? 0),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendFirmwareUpdateCommand(device: Device) {
  if (device.hardwareId) {
    await sendWebSocketDeviceCommand({
      device,
      command: 'firmwareUpdate',
      value: true,
    });
    return {ok: true};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${getDeviceBaseUrl(device)}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: 'firmwareUpdate',
        value: true,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as DeviceCommandResponse) : {};

    if (!response.ok || data.ok === false) {
      throw new Error(data.message ?? `COMMAND_FAILED_${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

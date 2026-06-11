import {
  Device,
  DeviceAutoState,
  DeviceCommand,
  FirmwareUpdateStatus,
} from './types';
import {hasDeviceCommandRoute} from './deviceControl';
import {sendWebSocketDeviceCommand} from './deviceWebSocket';
import {
  autoStateFromDeviceCode,
  normalizeFirmwareStatus,
} from './deviceRuntime';

export type DeviceCommandResponse = {
  ok?: boolean;
  message?: string;
};

type Esp32StatusResponse = {
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

function createCommandPayload(params: {
  command: DeviceCommand | 'firmwareUpdate';
  device: Device;
  value: boolean;
}) {
  return {
    command: params.command,
    token: params.device.commandToken,
    value: params.value,
  };
}

export type DeviceStatusSnapshot = {
  online: boolean;
  power?: boolean;
  powerControlSupported: boolean;
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

function ensureDeviceCommandRoute(device: Device) {
  if (device.isDemo) {
    return;
  }

  if (!device.commandToken) {
    throw new Error('DEVICE_COMMAND_TOKEN_MISSING');
  }

  if (!hasDeviceCommandRoute(device)) {
    throw new Error('DEVICE_COMMAND_ROUTE_MISSING');
  }
}

function shouldUseWebSocketOnly(device: Device) {
  return Boolean(device.hardwareId && !device.ipAddress);
}

async function sendLocalDeviceCommand(params: {
  device: Device;
  command: DeviceCommand | 'firmwareUpdate';
  value: boolean;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${getDeviceBaseUrl(params.device)}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createCommandPayload(params)),
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

export async function sendDeviceCommand(params: {
  device: Device;
  command: DeviceCommand;
  value: boolean;
}) {
  if (params.device.isDemo) {
    return {ok: true, message: 'DEMO_COMMAND_OK'};
  }

  ensureDeviceCommandRoute(params.device);

  if (shouldUseWebSocketOnly(params.device)) {
    await sendWebSocketDeviceCommand(params);
    return {ok: true};
  }

  try {
    return await sendLocalDeviceCommand(params);
  } catch (error) {
    try {
      await sendWebSocketDeviceCommand(params);
    } catch {
      throw error;
    }

    return {ok: true};
  }
}

export async function fetchDeviceStatus(
  device: Device,
): Promise<DeviceStatusSnapshot> {
  if (device.isDemo) {
    return {
      online: device.status === 'online',
      power: device.controls.power,
      powerControlSupported: true,
      running: device.controls.running,
      water: device.controls.water,
      fan: device.controls.fan,
      autoState: device.runtime?.autoState ?? 'idle',
      autoRunning: Boolean(device.runtime?.autoRunning),
      autoNextRunInMs: device.runtime?.autoNextRunInMs ?? 0,
      interlockOk: device.runtime?.interlockOk ?? true,
      fanRunLeftMs: device.runtime?.fanRunLeftMs ?? 0,
      firmwareVersion: device.runtime?.firmwareVersion,
      latestFirmwareVersion: device.runtime?.latestFirmwareVersion,
      firmwareUpdateStatus: device.runtime?.firmwareUpdateStatus,
      firmwareUpdateProgress: device.runtime?.firmwareUpdateProgress,
    };
  }

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

    const autoState = autoStateFromDeviceCode(data.auto_state);
    const autoRunning =
      Boolean(data.pump_req_auto) ||
      autoState === 'preparing' ||
      autoState === 'watering';

    const powerControlSupported = typeof data.power_enabled === 'boolean';

    return {
      online: Boolean(data.sta_connected),
      power: powerControlSupported ? Boolean(data.power_enabled) : undefined,
      powerControlSupported,
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
  if (device.isDemo) {
    return {ok: true, message: 'DEMO_FIRMWARE_UPDATE_OK'};
  }

  ensureDeviceCommandRoute(device);

  if (shouldUseWebSocketOnly(device)) {
    await sendWebSocketDeviceCommand({
      device,
      command: 'firmwareUpdate',
      value: true,
    });
    return {ok: true};
  }

  try {
    return await sendLocalDeviceCommand({
      command: 'firmwareUpdate',
      device,
      value: true,
    });
  } catch (error) {
    try {
      await sendWebSocketDeviceCommand({
        device,
        command: 'firmwareUpdate',
        value: true,
      });
    } catch {
      throw error;
    }

    return {ok: true};
  }
}

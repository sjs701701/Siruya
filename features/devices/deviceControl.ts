import {Device} from './types';

export type DeviceControlBlockReason =
  | 'offline'
  | 'setup'
  | 'missingToken'
  | 'missingRoute';

export function hasDeviceCommandRoute(device: Device) {
  if (device.isDemo) {
    return true;
  }

  return Boolean(device.commandToken && (device.ipAddress || device.hardwareId));
}

export function getDeviceControlBlockReason(
  device: Device,
): DeviceControlBlockReason | null {
  if (device.status === 'setup') {
    return 'setup';
  }

  if (device.status !== 'online') {
    return 'offline';
  }

  if (device.isDemo) {
    return null;
  }

  if (!device.commandToken) {
    return 'missingToken';
  }

  if (!device.ipAddress && !device.hardwareId) {
    return 'missingRoute';
  }

  return null;
}

export function isDeviceControlReady(device: Device) {
  return getDeviceControlBlockReason(device) === null;
}

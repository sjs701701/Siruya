import {DeviceAutoState, DeviceRuntime, FirmwareUpdateStatus} from './types';

export function createEmptyRuntime(): DeviceRuntime {
  return {
    autoState: 'idle',
    autoRunning: false,
    autoNextRunInMs: 0,
    interlockOk: false,
    fanRunLeftMs: 0,
  };
}

export function autoStateFromDeviceCode(autoState?: number): DeviceAutoState {
  if (autoState === 1) {
    return 'preparing';
  }

  if (autoState === 2) {
    return 'watering';
  }

  return 'idle';
}

export function normalizeFirmwareStatus(
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

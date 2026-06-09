import {DeviceStatus} from './types';

export function getDeviceStatusLabel(status: DeviceStatus) {
  if (status === 'online') {
    return '연결됨';
  }

  if (status === 'offline') {
    return '연결해제됨';
  }

  return '설정중';
}

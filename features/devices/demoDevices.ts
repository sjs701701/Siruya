import {Device, DeviceType} from './types';
import {WifiNetwork} from './wifiProvisioning';

export const demoDeviceSetupSsid = 'WaterPlant-DEMO-01';
export const demoProvisionedIp = '192.168.0.42';
export const demoHardwareId = 'demo-waterplant-001';

export const demoWifiNetworks: WifiNetwork[] = [
  {
    ssid: 'Siruya_Demo_2.4G',
    bssid: '00:11:22:33:44:55',
    level: -42,
    frequency: 2462,
    capabilities: '[WPA2-PSK-CCMP][ESS]',
  },
  {
    ssid: 'Office_Growroom_2.4G',
    bssid: '00:11:22:33:44:66',
    level: -61,
    frequency: 2412,
    capabilities: '[WPA2-PSK-CCMP][ESS]',
  },
  {
    ssid: 'Open_Test_2.4G',
    bssid: '00:11:22:33:44:77',
    level: -73,
    frequency: 2437,
    capabilities: '[ESS]',
  },
];

export function createDemoProvisionedDevice(params: {
  type: DeviceType;
  name: string;
  room: string;
  ipAddress?: string;
  hardwareId?: string;
}): Device {
  const createdAt = Date.now();

  return {
    id: `demo-${params.type}-${createdAt}`,
    hardwareId: params.hardwareId ?? demoHardwareId,
    isDemo: true,
    registeredAt: createdAt,
    growthStartedAt: createdAt,
    name: params.name.trim() || '콩나물재배기',
    type: params.type,
    room: params.room.trim() || '주방',
    status: 'online',
    ipAddress: params.ipAddress ?? demoProvisionedIp,
    controls: {
      running: true,
      water: false,
      fan: true,
      cleanMode: false,
    },
    runtime: {
      autoState: 'preparing',
      autoRunning: true,
      autoNextRunInMs: 20 * 60 * 1000,
      interlockOk: true,
      fanRunLeftMs: 90 * 1000,
      firmwareVersion: '1.0.3',
      latestFirmwareVersion: '1.0.4',
      firmwareUpdateStatus: 'available',
      firmwareUpdateProgress: 0,
      lastSeenAt: Date.now(),
    },
  };
}

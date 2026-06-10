import {Device, DeviceType, ProductDefinition} from './types';

export const productDefinitions: ProductDefinition[] = [
  {
    type: 'sprout-grower',
    title: '콩나물재배기',
    caption: 'ESP32 Wi-Fi 기기',
    badge: 'SP',
    defaultName: '콩나물재배기',
    defaultRoom: '주방',
    setupSsidPrefix: 'WaterPlant',
    provisioningUrl: 'http://192.168.4.1/provision',
    firmwareManifestUrl:
      'https://mqtt.app2-server.kr/firmware/sprout-grower/latest.json',
    sectionLabel: '콩나물재배기',
  },
  {
    type: 'future-device',
    title: '새 제품',
    caption: '다음 제품군을 위한 자리',
    badge: '+',
    defaultName: '새 기기',
    defaultRoom: '거실',
    setupSsidPrefix: 'DEVICE-SETUP',
    provisioningUrl: 'http://192.168.4.1/provision',
    sectionLabel: '기타 기기',
  },
];

const starterDeviceCreatedAt = Date.now();

export const starterDevices: Device[] = [
  {
    id: 'sprout-demo-1',
    registeredAt: starterDeviceCreatedAt,
    growthStartedAt: starterDeviceCreatedAt,
    name: '콩나물재배기',
    type: 'sprout-grower',
    room: '베란다',
    status: 'online',
    ipAddress: '192.168.4.21',
    controls: {
      water: false,
      fan: true,
      cleanMode: false,
      running: true,
    },
  },
];

export function getProductDefinition(type: DeviceType) {
  return (
    productDefinitions.find(product => product.type === type) ??
    productDefinitions[0]
  );
}

export function createDevice(params: {
  type: DeviceType;
  name: string;
  room: string;
  ipAddress?: string;
  hardwareId?: string;
  commandToken?: string;
}): Device {
  const product = getProductDefinition(params.type);
  const createdAt = Date.now();

  return {
    id: `${params.type}-${createdAt}`,
    hardwareId: params.hardwareId,
    commandToken: params.commandToken,
    registeredAt: createdAt,
    growthStartedAt: createdAt,
    name: params.name.trim() || product.defaultName,
    type: params.type,
    room: params.room.trim() || product.defaultRoom,
    status: params.ipAddress ? 'online' : 'setup',
    ipAddress: params.ipAddress,
    controls: {
      water: false,
      fan: false,
      cleanMode: false,
      running: false,
    },
  };
}

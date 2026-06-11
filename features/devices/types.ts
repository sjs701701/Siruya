export type DeviceType = 'sprout-grower' | 'future-device';

export type DeviceStatus = 'online' | 'offline' | 'setup';

export type DeviceControls = {
  power: boolean;
  water: boolean;
  fan: boolean;
  cleanMode: boolean;
  running: boolean;
};

export type DeviceCommand = keyof DeviceControls;

export type DeviceAutoState = 'idle' | 'preparing' | 'watering';

export type FirmwareUpdateStatus =
  | 'idle'
  | 'available'
  | 'updating'
  | 'updated'
  | 'failed';

export type DeviceRuntime = {
  autoState: DeviceAutoState;
  autoRunning: boolean;
  autoNextRunInMs: number;
  interlockOk: boolean;
  fanRunLeftMs: number;
  firmwareVersion?: string;
  latestFirmwareVersion?: string;
  firmwareUpdateStatus?: FirmwareUpdateStatus;
  firmwareUpdateProgress?: number;
  powerControlSupported?: boolean;
  lastSeenAt?: number;
};

export type Device = {
  id: string;
  hardwareId?: string;
  commandToken?: string;
  isDemo?: boolean;
  registeredAt: number;
  growthStartedAt: number;
  name: string;
  type: DeviceType;
  room: string;
  status: DeviceStatus;
  ipAddress?: string;
  controls: DeviceControls;
  runtime?: DeviceRuntime;
};

export type ProvisionStep = 'select' | 'connect' | 'wifi' | 'name';

export type ProductDefinition = {
  type: DeviceType;
  title: string;
  caption: string;
  badge: string;
  defaultName: string;
  defaultRoom: string;
  setupSsidPrefix: string;
  provisioningUrl: string;
  firmwareManifestUrl?: string;
  sectionLabel: string;
};

export type DeviceUpdater = (
  id: string,
  updater: (device: Device) => Device,
) => void;

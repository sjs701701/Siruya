import {
  getDeviceControlBlockReason,
  hasDeviceCommandRoute,
  isDeviceControlReady,
} from '../deviceControl';
import {Device} from '../types';

function createDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-1',
    commandToken: 'command-token-1',
    registeredAt: 1,
    growthStartedAt: 1,
    name: 'Sprout Grower',
    type: 'sprout-grower',
    room: 'Kitchen',
    status: 'online',
    ipAddress: '192.168.0.10',
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

describe('deviceControl', () => {
  it('treats an online device with a token and command route as control-ready', () => {
    const device = createDevice({hardwareId: 'HW-1'});

    expect(hasDeviceCommandRoute(device)).toBe(true);
    expect(isDeviceControlReady(device)).toBe(true);
    expect(getDeviceControlBlockReason(device)).toBeNull();
  });

  it('treats a cloud-connected device without local IP as control-ready', () => {
    const device = createDevice({hardwareId: 'HW-1', ipAddress: undefined});

    expect(hasDeviceCommandRoute(device)).toBe(true);
    expect(isDeviceControlReady(device)).toBe(true);
    expect(getDeviceControlBlockReason(device)).toBeNull();
  });

  it('does not treat a status-only online device as connected for control', () => {
    const device = createDevice({commandToken: undefined});

    expect(hasDeviceCommandRoute(device)).toBe(false);
    expect(isDeviceControlReady(device)).toBe(false);
    expect(getDeviceControlBlockReason(device)).toBe('missingToken');
  });

  it('requires an online status before reporting control-ready', () => {
    const device = createDevice({status: 'offline'});

    expect(hasDeviceCommandRoute(device)).toBe(true);
    expect(isDeviceControlReady(device)).toBe(false);
    expect(getDeviceControlBlockReason(device)).toBe('offline');
  });
});

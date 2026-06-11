import {
  getGrowthProgress,
  normalizeDeviceLifecycleDates,
  shiftGrowthStartedAt,
} from '../growthProgress';
import {Device} from '../types';

const baseDevice: Device = {
  id: 'device-1',
  registeredAt: Date.UTC(2026, 5, 1),
  growthStartedAt: Date.UTC(2026, 5, 1),
  name: '콩나물 재배기',
  type: 'sprout-grower',
  room: '주방',
  status: 'online',
  controls: {
    power: false,
    water: false,
    fan: false,
    cleanMode: false,
    running: false,
  },
};

describe('growthProgress', () => {
  it('calculates growth day and harvest countdown on a six day cycle', () => {
    const progress = getGrowthProgress(
      Date.UTC(2026, 5, 1),
      Date.UTC(2026, 5, 3),
    );

    expect(progress).toEqual({
      day: 3,
      daysUntilHarvest: 3,
      progressPercent: 50,
      summary: '3일차 · 수확까지 3일',
    });
  });

  it('marks the crop as ready when the cycle reaches the final day', () => {
    expect(
      getGrowthProgress(Date.UTC(2026, 5, 1), Date.UTC(2026, 5, 6)).summary,
    ).toBe('6일차 · 수확 권장');
  });

  it('fills missing lifecycle dates for previously stored devices', () => {
    const now = Date.UTC(2026, 5, 10);
    const legacyDevice = {
      ...baseDevice,
      registeredAt: undefined,
      growthStartedAt: undefined,
    } as unknown as Device;

    expect(normalizeDeviceLifecycleDates(legacyDevice, now)).toEqual({
      ...legacyDevice,
      registeredAt: now,
      growthStartedAt: now,
    });
  });

  it('shifts the growth start date by whole days', () => {
    expect(shiftGrowthStartedAt(Date.UTC(2026, 5, 1), 1)).toBe(
      Date.UTC(2026, 5, 2),
    );
  });
});

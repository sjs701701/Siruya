import {Device} from './types';

export const GROWTH_CYCLE_DAYS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type GrowthProgress = {
  day: number;
  daysUntilHarvest: number;
  progressPercent: number;
  summary: string;
};

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function normalizeDeviceLifecycleDates(device: Device, now = Date.now()) {
  const registeredAt = isValidTimestamp(device.registeredAt)
    ? device.registeredAt
    : now;
  const growthStartedAt = isValidTimestamp(device.growthStartedAt)
    ? device.growthStartedAt
    : registeredAt;

  if (
    registeredAt === device.registeredAt &&
    growthStartedAt === device.growthStartedAt
  ) {
    return device;
  }

  return {
    ...device,
    registeredAt,
    growthStartedAt,
  };
}

export function getGrowthProgress(
  growthStartedAt: number,
  now = Date.now(),
): GrowthProgress {
  const elapsedDays = Math.max(
    0,
    Math.floor((startOfLocalDay(now) - startOfLocalDay(growthStartedAt)) / MS_PER_DAY),
  );
  const day = Math.min(elapsedDays + 1, GROWTH_CYCLE_DAYS);
  const daysUntilHarvest = Math.max(GROWTH_CYCLE_DAYS - day, 0);
  const progressPercent = Math.min(
    100,
    Math.round((day / GROWTH_CYCLE_DAYS) * 100),
  );
  const summary =
    daysUntilHarvest > 0
      ? `${day}일차 · 수확까지 ${daysUntilHarvest}일`
      : `${day}일차 · 수확 권장`;

  return {
    day,
    daysUntilHarvest,
    progressPercent,
    summary,
  };
}

export function shiftGrowthStartedAt(growthStartedAt: number, days: number) {
  return growthStartedAt + days * MS_PER_DAY;
}

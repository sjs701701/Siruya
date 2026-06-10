import {
  getAutoCyclePhase,
  getNextSprayText,
  getWaterCycleProgress,
  WATER_AUTO_CYCLE_MS,
} from '../runtimeDisplay';
import {DeviceRuntime} from '../types';

const BASE_NOW = 1_750_000_000_000;

function makeRuntime(overrides: Partial<DeviceRuntime> = {}): DeviceRuntime {
  return {
    autoState: 'idle',
    autoRunning: true,
    autoNextRunInMs: WATER_AUTO_CYCLE_MS,
    interlockOk: true,
    fanRunLeftMs: 0,
    lastSeenAt: BASE_NOW,
    ...overrides,
  };
}

describe('getAutoCyclePhase', () => {
  it('prioritizes the device-reported watering and preparing states', () => {
    expect(getAutoCyclePhase(makeRuntime({autoState: 'watering'}), BASE_NOW)).toBe(
      'watering',
    );
    expect(
      getAutoCyclePhase(makeRuntime({autoState: 'preparing'}), BASE_NOW),
    ).toBe('preparing');
  });

  it('reports none without a runtime or an active reservation', () => {
    expect(getAutoCyclePhase(undefined, BASE_NOW)).toBe('none');
    expect(
      getAutoCyclePhase(makeRuntime({autoNextRunInMs: 0}), BASE_NOW),
    ).toBe('none');
  });

  it('counts down while the reservation has time left', () => {
    const runtime = makeRuntime();

    expect(getAutoCyclePhase(runtime, BASE_NOW)).toBe('counting');
    expect(
      getAutoCyclePhase(runtime, BASE_NOW + WATER_AUTO_CYCLE_MS - 1000),
    ).toBe('counting');
  });

  it('bridges the gap between countdown end and the device report as imminent', () => {
    const runtime = makeRuntime();

    expect(
      getAutoCyclePhase(runtime, BASE_NOW + WATER_AUTO_CYCLE_MS + 3000),
    ).toBe('imminent');
  });

  it('gives up the imminent bridge once the device stays silent too long', () => {
    const runtime = makeRuntime();

    expect(
      getAutoCyclePhase(runtime, BASE_NOW + WATER_AUTO_CYCLE_MS + 60_000),
    ).toBe('none');
  });
});

describe('getWaterCycleProgress', () => {
  it('is empty without a reservation and full while watering', () => {
    expect(getWaterCycleProgress(undefined, BASE_NOW)).toBe(0);
    expect(
      getWaterCycleProgress(makeRuntime({autoNextRunInMs: 0}), BASE_NOW),
    ).toBe(0);
    expect(
      getWaterCycleProgress(makeRuntime({autoState: 'watering'}), BASE_NOW),
    ).toBe(1);
  });

  it('fills across the whole two-hour cycle instead of only the tail', () => {
    const runtime = makeRuntime();
    const quarter = getWaterCycleProgress(
      runtime,
      BASE_NOW + WATER_AUTO_CYCLE_MS * 0.25,
    );
    const half = getWaterCycleProgress(
      runtime,
      BASE_NOW + WATER_AUTO_CYCLE_MS * 0.5,
    );
    const nearEnd = getWaterCycleProgress(
      runtime,
      BASE_NOW + WATER_AUTO_CYCLE_MS * 0.95,
    );

    expect(quarter).toBeCloseTo(0.25, 2);
    expect(half).toBeCloseTo(0.5, 2);
    expect(nearEnd).toBeCloseTo(0.95, 2);
  });

  it('keeps a small visible arc right after a cycle restarts', () => {
    const runtime = makeRuntime();

    expect(getWaterCycleProgress(runtime, BASE_NOW)).toBeGreaterThan(0);
  });

  it('never moves backwards from countdown end through preparing to watering', () => {
    const runtime = makeRuntime();
    const countdownEnd = getWaterCycleProgress(
      runtime,
      BASE_NOW + WATER_AUTO_CYCLE_MS - 1000,
    );
    const imminent = getWaterCycleProgress(
      runtime,
      BASE_NOW + WATER_AUTO_CYCLE_MS + 3000,
    );
    const preparing = getWaterCycleProgress(
      makeRuntime({autoState: 'preparing'}),
      BASE_NOW,
    );
    const watering = getWaterCycleProgress(
      makeRuntime({autoState: 'watering'}),
      BASE_NOW,
    );

    expect(imminent).toBeGreaterThanOrEqual(countdownEnd);
    expect(preparing).toBeGreaterThanOrEqual(imminent);
    expect(watering).toBeGreaterThanOrEqual(preparing);
  });

  it('clamps progress when the device reports a longer cycle than expected', () => {
    const runtime = makeRuntime({
      autoNextRunInMs: WATER_AUTO_CYCLE_MS * 2,
    });

    const progress = getWaterCycleProgress(runtime, BASE_NOW);

    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });
});

describe('getNextSprayText', () => {
  it('shows the countdown while waiting for the next spray', () => {
    const runtime = makeRuntime({autoNextRunInMs: 9 * 60 * 1000 + 30 * 1000});

    expect(getNextSprayText(runtime, BASE_NOW)).toBe('9분 30초');
  });

  it('does not flash 예약 없음 in the gap before the device reports spraying', () => {
    const runtime = makeRuntime();

    expect(
      getNextSprayText(runtime, BASE_NOW + WATER_AUTO_CYCLE_MS + 3000),
    ).toBe('곧 분사');
  });

  it('labels device-reported states and missing reservations', () => {
    expect(getNextSprayText(makeRuntime({autoState: 'watering'}), BASE_NOW)).toBe(
      '분사 중',
    );
    expect(
      getNextSprayText(makeRuntime({autoState: 'preparing'}), BASE_NOW),
    ).toBe('곧 분사');
    expect(
      getNextSprayText(makeRuntime({autoNextRunInMs: 0}), BASE_NOW),
    ).toBe('예약 없음');
  });
});

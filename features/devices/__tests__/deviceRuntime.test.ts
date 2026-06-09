import {
  autoStateFromDeviceCode,
  createEmptyRuntime,
  normalizeFirmwareStatus,
} from '../deviceRuntime';

describe('deviceRuntime', () => {
  it('creates an idle runtime with no active device work', () => {
    expect(createEmptyRuntime()).toEqual({
      autoState: 'idle',
      autoRunning: false,
      autoNextRunInMs: 0,
      interlockOk: false,
      fanRunLeftMs: 0,
    });
  });

  it('creates a fresh runtime object for each caller', () => {
    const firstRuntime = createEmptyRuntime();
    const secondRuntime = createEmptyRuntime();

    firstRuntime.autoState = 'watering';

    expect(secondRuntime.autoState).toBe('idle');
  });

  it('maps device auto state codes to app runtime labels', () => {
    expect(autoStateFromDeviceCode(1)).toBe('preparing');
    expect(autoStateFromDeviceCode(2)).toBe('watering');
    expect(autoStateFromDeviceCode(0)).toBe('idle');
    expect(autoStateFromDeviceCode(undefined)).toBe('idle');
  });

  it('keeps recognized firmware states and derives unknown states from update availability', () => {
    expect(normalizeFirmwareStatus('available', false)).toBe('available');
    expect(normalizeFirmwareStatus('updating', false)).toBe('updating');
    expect(normalizeFirmwareStatus('updated', false)).toBe('updated');
    expect(normalizeFirmwareStatus('failed', false)).toBe('failed');
    expect(normalizeFirmwareStatus('unexpected', true)).toBe('available');
    expect(normalizeFirmwareStatus('unexpected', false)).toBe('idle');
    expect(normalizeFirmwareStatus(undefined, true)).toBe('available');
    expect(normalizeFirmwareStatus(undefined, false)).toBe('idle');
  });
});

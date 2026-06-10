import {
  hasFirmwareManifestUpdate,
  hasUsableFirmwareManifest,
  isNewerFirmwareVersion,
} from '../firmwareManifest';

describe('isNewerFirmwareVersion', () => {
  it('compares numeric version segments instead of plain strings', () => {
    expect(isNewerFirmwareVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerFirmwareVersion('1.0.7', '1.0.8')).toBe(false);
    expect(isNewerFirmwareVersion('1.0.7', '1.0.7')).toBe(false);
  });

  it('does not offer updates for invalid version strings', () => {
    expect(isNewerFirmwareVersion('1.0.beta', '1.0.7')).toBe(false);
    expect(isNewerFirmwareVersion('1.0.8', undefined)).toBe(false);
  });
});

describe('hasFirmwareManifestUpdate', () => {
  const usableManifest = {
    product: 'sprout-grower',
    version: '1.0.8',
    url: 'https://example.com/waterplant_1.0.8.bin',
    md5: '0123456789abcdef0123456789abcdef',
  };

  it('requires a newer version and a valid md5 checksum', () => {
    expect(hasUsableFirmwareManifest(usableManifest)).toBe(true);
    expect(hasFirmwareManifestUpdate('1.0.7', usableManifest)).toBe(true);
  });

  it('hides downgrade and missing-checksum manifests from the app update UI', () => {
    expect(
      hasFirmwareManifestUpdate('1.0.8', {
        ...usableManifest,
        version: '1.0.7',
      }),
    ).toBe(false);
    expect(
      hasFirmwareManifestUpdate('1.0.7', {
        ...usableManifest,
        md5: undefined,
      }),
    ).toBe(false);
  });
});

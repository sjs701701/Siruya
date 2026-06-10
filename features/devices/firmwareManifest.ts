export type FirmwareManifest = {
  product?: string;
  version?: string;
  url?: string;
  md5?: string;
  required?: boolean;
  notes?: string;
};

export async function fetchFirmwareManifest(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const requestUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as FirmwareManifest) : {};

    if (!response.ok || !data.version) {
      throw new Error(`FIRMWARE_MANIFEST_FAILED_${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function parseVersionSegments(version?: string) {
  if (!version) {
    return null;
  }

  const segments = version
    .trim()
    .split('.')
    .map(segment => segment.trim());

  if (
    segments.length === 0 ||
    segments.some(segment => !/^\d+$/.test(segment))
  ) {
    return null;
  }

  return segments.map(segment => Number(segment));
}

export function isNewerFirmwareVersion(
  latestVersion?: string,
  currentVersion?: string,
) {
  const latest = parseVersionSegments(latestVersion);
  const current = parseVersionSegments(currentVersion);

  if (!latest || !current) {
    return false;
  }

  const maxLength = Math.max(latest.length, current.length);

  for (let index = 0; index < maxLength; index += 1) {
    const latestSegment = latest[index] ?? 0;
    const currentSegment = current[index] ?? 0;

    if (latestSegment > currentSegment) {
      return true;
    }

    if (latestSegment < currentSegment) {
      return false;
    }
  }

  return false;
}

export function hasUsableFirmwareManifest(
  manifest: FirmwareManifest | null | undefined,
) {
  return Boolean(
    manifest?.version &&
      manifest?.url &&
      typeof manifest.md5 === 'string' &&
      /^[a-fA-F0-9]{32}$/.test(manifest.md5.trim()),
  );
}

export function hasFirmwareManifestUpdate(
  currentVersion: string | undefined,
  manifest: FirmwareManifest | null | undefined,
) {
  return (
    hasUsableFirmwareManifest(manifest) &&
    isNewerFirmwareVersion(manifest?.version, currentVersion)
  );
}

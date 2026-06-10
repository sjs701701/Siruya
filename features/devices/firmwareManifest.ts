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

export function hasDifferentFirmwareVersion(
  currentVersion?: string,
  latestVersion?: string,
) {
  if (!latestVersion) {
    return false;
  }

  if (!currentVersion) {
    return false;
  }

  return currentVersion.trim() !== latestVersion.trim();
}

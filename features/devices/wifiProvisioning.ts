import {PermissionsAndroid, Platform} from 'react-native';
import WifiManager from 'react-native-wifi-reborn';

export type WifiNetwork = {
  ssid: string;
  bssid?: string;
  level: number;
  frequency?: number;
  capabilities?: string;
};

export type ProvisionResponse = {
  ok?: boolean;
  device_id?: string;
  ap_ssid?: string;
  sta_status?: string;
  ip?: string;
};

export type WifiPermissionResult = {
  granted: boolean;
  blocked: boolean;
};

const DEFAULT_DEVICE_WIFI_PREFIXES = ['Water', 'WaterPlant', 'ESP32C3_SETUP'];
const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

async function requestAndroidPermission(
  permission: Parameters<typeof PermissionsAndroid.request>[0],
  title: string,
  message: string,
) {
  const result = await PermissionsAndroid.request(permission, {
    title,
    message,
    buttonPositive: '허용',
    buttonNegative: '거부',
  });

  return {
    granted: result === PermissionsAndroid.RESULTS.GRANTED,
    blocked: result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  };
}

export async function requestWifiScanPermission(): Promise<WifiPermissionResult> {
  if (Platform.OS !== 'android') {
    return {granted: true, blocked: false};
  }

  const fineLocation = await requestAndroidPermission(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    'Wi-Fi 검색 권한',
    '주변 Wi-Fi와 현재 연결된 Wi-Fi를 확인하려면 위치 권한이 필요합니다.',
  );

  if (!fineLocation.granted) {
    return fineLocation;
  }

  if (Platform.Version >= 33) {
    const nearbyWifiPermission =
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;

    if (nearbyWifiPermission) {
      const nearbyWifi = await requestAndroidPermission(
        nearbyWifiPermission,
        '근처 Wi-Fi 기기 권한',
        '현재 연결된 Wi-Fi와 주변 Wi-Fi 정보를 확인하려면 근처 Wi-Fi 권한이 필요합니다.',
      );

      if (!nearbyWifi.granted) {
        return nearbyWifi;
      }
    }
  }

  return {granted: true, blocked: false};
}

export async function getCurrentWifiSsid() {
  if (Platform.OS === 'android') {
    const permission = await requestWifiScanPermission();

    if (!permission.granted) {
      return '';
    }
  }

  try {
    const ssid = await WifiManager.getCurrentWifiSSID();
    return normalizeSsidForDisplay(ssid);
  } catch {
    return '';
  }
}

export async function isConnectedToDeviceWifi(setupSsidPrefix: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentSsid = await getCurrentWifiSsid();

    if (isDeviceSetupSsid(currentSsid, setupSsidPrefix)) {
      return true;
    }

    if (attempt < 2) {
      await delay(700);
    }
  }

  return false;
}

export async function disconnectFromDeviceWifi(setupSsidPrefix: string) {
  const currentSsid = await getCurrentWifiSsid();

  if (!isDeviceSetupSsid(currentSsid, setupSsidPrefix)) {
    return false;
  }

  await WifiManager.disconnect();
  return true;
}

export async function connectToHomeWifi(params: {
  ssid: string;
  password: string;
  secured: boolean;
}) {
  if (params.secured) {
    await WifiManager.connectToProtectedSSID(
      params.ssid,
      params.password,
      false,
      false,
    );
    return;
  }

  await WifiManager.connectToSSID(params.ssid);
}

export async function scanWifiNetworks(): Promise<WifiNetwork[]> {
  const permission = await requestWifiScanPermission();

  if (!permission.granted) {
    throw new Error(
      permission.blocked ? 'WIFI_PERMISSION_BLOCKED' : 'WIFI_PERMISSION_DENIED',
    );
  }

  const networks = await WifiManager.loadWifiList();
  const deduped = new Map<string, WifiNetwork>();

  networks.forEach(network => {
    const ssid = network.SSID;

    if (!ssid) {
      return;
    }

    const frequency = Number(network.frequency) || undefined;

    if (!isSupportedEsp32Wifi(ssid, frequency)) {
      return;
    }

    const level = Number(network.level ?? -100);
    const current = deduped.get(ssid);

    if (!current || level > current.level) {
      deduped.set(ssid, {
        ssid,
        bssid: network.BSSID,
        level,
        frequency,
        capabilities: network.capabilities,
      });
    }
  });

  return Array.from(deduped.values()).sort((a, b) => b.level - a.level);
}

export async function sendWifiCredentials(params: {
  provisioningUrl: string;
  ssid: string;
  password: string;
}): Promise<ProvisionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(params.provisioningUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ssid: params.ssid,
        password: params.password,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as ProvisionResponse) : {};

    if (!response.ok || data.ok === false) {
      throw new Error(`PROVISION_FAILED_${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function getSignalLabel(level: number) {
  if (level >= -55) {
    return '강함';
  }

  if (level >= -70) {
    return '보통';
  }

  return '약함';
}

export function isSecuredNetwork(network: WifiNetwork) {
  return Boolean(network.capabilities?.match(/WEP|WPA|SAE|EAP/i));
}

export function isSupportedEsp32Wifi(ssid: string, frequency?: number) {
  if (frequency) {
    return frequency >= 2400 && frequency < 2500;
  }

  return !/(^|[\s_-])5g(hz)?($|[\s_-])/i.test(ssid);
}

export function isDeviceSetupSsid(ssid: string, setupSsidPrefix: string) {
  const normalizedSsid = normalizeSsidForCompare(ssid);
  const prefixes = [setupSsidPrefix, ...DEFAULT_DEVICE_WIFI_PREFIXES]
    .map(normalizeSsidForCompare)
    .filter(Boolean);

  return prefixes.some(prefix => normalizedSsid.startsWith(prefix));
}

function normalizeSsidForDisplay(ssid: string) {
  return ssid.replace(/^"|"$/g, '').trim();
}

function normalizeSsidForCompare(ssid: string) {
  return normalizeSsidForDisplay(ssid).toLowerCase();
}

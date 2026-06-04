import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createDevice,
  getProductDefinition,
  productDefinitions,
} from './deviceRegistry';
import {LabeledInput} from './DeviceFormFields';
import {Device, DeviceType, ProvisionStep} from './types';
import {
  connectToHomeWifi,
  disconnectFromDeviceWifi,
  getCurrentWifiSsid,
  getSignalLabel,
  isConnectedToDeviceWifi,
  isDeviceSetupSsid,
  isSecuredNetwork,
  scanWifiNetworks,
  sendWifiCredentials,
  WifiNetwork,
} from './wifiProvisioning';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (device: Device) => void;
};

const steps: ProvisionStep[] = ['select', 'connect', 'wifi', 'name'];

function AddDeviceModal({visible, onClose, onAdd}: Props) {
  const [step, setStep] = useState<ProvisionStep>('select');
  const [selectedType, setSelectedType] = useState<DeviceType>('sprout-grower');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(
    null,
  );
  const [passwordNetwork, setPasswordNetwork] = useState<WifiNetwork | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [currentSsid, setCurrentSsid] = useState('');
  const [isCheckingDeviceWifi, setIsCheckingDeviceWifi] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [provisionedIp, setProvisionedIp] = useState<string | undefined>();
  const [provisionedDeviceId, setProvisionedDeviceId] = useState<
    string | undefined
  >();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');

  const selectedProduct = getProductDefinition(selectedType);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const defaultProduct = getProductDefinition('sprout-grower');
    setStep('select');
    setSelectedType('sprout-grower');
    setNetworks([]);
    setSelectedNetwork(null);
    setPasswordNetwork(null);
    setPassword('');
    setCurrentSsid('');
    setIsProvisioning(false);
    setScanError('');
    setConnectionMessage('');
    setProvisionedIp(undefined);
    setProvisionedDeviceId(undefined);
    setName(defaultProduct.defaultName);
    setRoom(defaultProduct.defaultRoom);
  }, [visible]);

  useEffect(() => {
    setName(selectedProduct.defaultName);
    setRoom(selectedProduct.defaultRoom);
  }, [selectedProduct]);

  useEffect(() => {
    if (visible && step === 'wifi' && networks.length === 0 && !isScanning) {
      refreshWifiList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step]);

  const titleByStep = {
    select: '장치 추가',
    connect: '기기 Wi-Fi 연결',
    wifi: '집 Wi-Fi 선택',
    name: '장치 이름 설정',
  };

  const refreshCurrentSsid = async () => {
    const ssid = await getCurrentWifiSsid();
    setCurrentSsid(ssid);
    return ssid;
  };

  const refreshWifiList = async () => {
    setIsScanning(true);
    setScanError('');
    setConnectionMessage('');

    try {
      const nextNetworks = await scanWifiNetworks();
      setNetworks(
        nextNetworks.filter(
          network =>
            !isDeviceSetupSsid(network.ssid, selectedProduct.setupSsidPrefix),
        ),
      );
    } catch (error) {
      setScanError(
        error instanceof Error && error.message === 'WIFI_PERMISSION_BLOCKED'
          ? 'Wi-Fi 검색 권한이 차단되었습니다. 앱 설정에서 위치 권한을 허용해주세요.'
          : error instanceof Error && error.message === 'WIFI_PERMISSION_DENIED'
            ? 'Wi-Fi 검색 권한이 거부되었습니다.'
            : '주변 Wi-Fi를 검색하지 못했습니다. 위치와 Wi-Fi가 켜져 있는지 확인해주세요.',
      );
    } finally {
      setIsScanning(false);
    }
  };

  const ensureDeviceWifiConnected = async () => {
    setIsCheckingDeviceWifi(true);

    try {
      const connected = await isConnectedToDeviceWifi(
        selectedProduct.setupSsidPrefix,
      );
      await refreshCurrentSsid();

      if (!connected) {
        Alert.alert(
          '기기 Wi-Fi 연결 필요',
          `${selectedProduct.setupSsidPrefix}로 시작하는 기기 Wi-Fi에 먼저 연결해주세요.`,
        );
      }

      return connected;
    } finally {
      setIsCheckingDeviceWifi(false);
    }
  };

  const sendWifiCredentialsToDevice = async () => {
    if (!selectedNetwork) {
      Alert.alert('Wi-Fi 선택', '연결할 Wi-Fi를 선택해주세요.');
      return false;
    }

    if (isSecuredNetwork(selectedNetwork) && password.length === 0) {
      setPasswordNetwork(selectedNetwork);
      return false;
    }

    const connected = await ensureDeviceWifiConnected();
    if (!connected) {
      return false;
    }

    setIsProvisioning(true);
    setConnectionMessage('기기에 Wi-Fi 정보를 보내는 중입니다...');

    try {
      const result = await sendWifiCredentials({
        provisioningUrl: selectedProduct.provisioningUrl,
        ssid: selectedNetwork.ssid,
        password,
      });
      setProvisionedIp(result.ip);
      setProvisionedDeviceId(result.device_id);
      setConnectionMessage(
        result.ip
          ? `기기가 ${selectedNetwork.ssid}에 연결되었습니다. IP: ${result.ip}`
          : `기기가 ${selectedNetwork.ssid}에 연결되었습니다.`,
      );

      return true;
    } catch {
      setConnectionMessage('');
      Alert.alert(
        '기기 연결 실패',
        '기기에 Wi-Fi 정보를 보내지 못했습니다. 휴대폰이 기기 Wi-Fi에 연결되어 있는지 확인해주세요.',
      );
      return false;
    } finally {
      setIsProvisioning(false);
    }
  };

  const returnPhoneToHomeWifi = async () => {
    if (!selectedNetwork) {
      return;
    }

    try {
      await disconnectFromDeviceWifi(selectedProduct.setupSsidPrefix);
      await connectToHomeWifi({
        ssid: selectedNetwork.ssid,
        password,
        secured: isSecuredNetwork(selectedNetwork),
      });
    } catch {
      Alert.alert(
        '휴대폰 Wi-Fi 연결 확인',
        `${selectedNetwork.ssid}로 자동 연결하지 못했습니다. 휴대폰 Wi-Fi 설정에서 직접 연결되어 있는지 확인해주세요.`,
      );
    }
  };

  const goBack = () => {
    const index = steps.indexOf(step);
    setStep(steps[Math.max(index - 1, 0)]);
  };

  const goNext = async () => {
    if (step === 'connect') {
      const connected = await ensureDeviceWifiConnected();
      if (!connected) {
        return;
      }
    }

    if (step === 'wifi') {
      const sent = await sendWifiCredentialsToDevice();
      if (!sent) {
        return;
      }
    }

    const index = steps.indexOf(step);
    if (index < steps.length - 1) {
      setStep(steps[index + 1]);
      return;
    }

    await returnPhoneToHomeWifi();
    onAdd(
      createDevice({
        type: selectedType,
        name,
        room,
        ipAddress: provisionedIp,
        hardwareId: provisionedDeviceId,
      }),
    );
    onClose();
  };

  const selectNetwork = (network: WifiNetwork) => {
    setSelectedNetwork(network);
    setPassword('');
    setConnectionMessage('');

    if (isSecuredNetwork(network)) {
      setPasswordNetwork(network);
      return;
    }

    setConnectionMessage(
      `${network.ssid} 선택됨. 아래 연결 버튼을 누르면 기기에 Wi-Fi 정보를 보냅니다.`,
    );
  };

  const confirmPassword = () => {
    if (!passwordNetwork) {
      return;
    }

    if (isSecuredNetwork(passwordNetwork) && password.length === 0) {
      Alert.alert('비밀번호 입력', 'Wi-Fi 비밀번호를 입력해주세요.');
      return;
    }

    setSelectedNetwork(passwordNetwork);
    setPasswordNetwork(null);
    setConnectionMessage(
      `${passwordNetwork.ssid} 선택됨. 아래 연결 버튼을 누르면 기기에 Wi-Fi 정보를 보냅니다.`,
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>x</Text>
          </Pressable>
          <Text style={styles.title}>{titleByStep[step]}</Text>
          <View style={styles.closeButton} />
        </View>

        <View style={styles.progress}>
          {steps.map(item => (
            <View
              key={item}
              style={[styles.progressDot, step === item && styles.progressOn]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {step === 'select' && (
            <>
              <Text style={styles.lead}>
                등록할 제품을 선택하세요. 제품군이 늘어나도 같은 흐름으로
                추가할 수 있습니다.
              </Text>
              {productDefinitions.map(product => (
                <Pressable
                  key={product.type}
                  style={[
                    styles.productRow,
                    selectedType === product.type && styles.productRowActive,
                  ]}
                  onPress={() => setSelectedType(product.type)}>
                  <View style={styles.productBadge}>
                    <Text style={styles.productBadgeText}>{product.badge}</Text>
                  </View>
                  <View style={styles.productCopy}>
                    <Text style={styles.productTitle}>{product.title}</Text>
                    <Text style={styles.productCaption}>{product.caption}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {step === 'connect' && (
            <View style={styles.guidePanel}>
              <Text style={styles.guideNumber}>1</Text>
              <Text style={styles.guideTitle}>기기 Wi-Fi에 연결</Text>
              <Text style={styles.guideText}>
                휴대폰 Wi-Fi 설정에서 `{selectedProduct.setupSsidPrefix}`로
                시작하는 네트워크를 선택하세요. 연결되지 않으면 다음 단계로
                넘어갈 수 없습니다.
              </Text>
              <Pressable
                style={styles.checkButton}
                onPress={ensureDeviceWifiConnected}
                disabled={isCheckingDeviceWifi}>
                <Text style={styles.checkButtonText}>
                  {isCheckingDeviceWifi ? '확인 중' : '연결 확인'}
                </Text>
              </Pressable>
              {currentSsid.length > 0 && (
                <Text style={styles.currentSsid}>현재 연결: {currentSsid}</Text>
              )}
            </View>
          )}

          {step === 'wifi' && (
            <>
              <View style={styles.wifiListHeader}>
                <Text style={styles.wifiTitle}>Wi-Fi</Text>
                <Pressable onPress={refreshWifiList} disabled={isScanning}>
                  <Text style={styles.refreshText}>
                    {isScanning ? '검색 중' : '새로고침'}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.wifiBandNotice}>
                ESP32 연결을 위해 2.4GHz Wi-Fi만 표시됩니다.
              </Text>

              {isScanning && (
                <View style={styles.loadingPanel}>
                  <ActivityIndicator size="small" color="#0a84ff" />
                  <Text style={styles.loadingText}>주변 Wi-Fi 검색 중</Text>
                </View>
              )}

              {scanError.length > 0 && (
                <View style={styles.errorPanel}>
                  <Text style={styles.errorText}>{scanError}</Text>
                </View>
              )}

              {connectionMessage.length > 0 && (
                <View
                  style={[
                    styles.successPanel,
                    !isProvisioning && styles.selectedWifiPanel,
                  ]}>
                  <Text
                    style={[
                      styles.successText,
                      !isProvisioning && styles.selectedWifiText,
                    ]}>
                    {connectionMessage}
                  </Text>
                </View>
              )}

              <View style={styles.wifiList}>
                {networks.map(network => (
                  <WifiNetworkRow
                    key={`${network.ssid}-${network.bssid ?? network.level}`}
                    network={network}
                    selected={selectedNetwork?.ssid === network.ssid}
                    onPress={() => selectNetwork(network)}
                  />
                ))}
                <Pressable style={styles.otherNetworkRow}>
                  <Text style={styles.otherNetworkText}>기타...</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 'name' && (
            <>
              <Text style={styles.lead}>
                홈에 표시할 이름과 위치를 정해주세요.
              </Text>
              <LabeledInput
                label="장치 이름"
                value={name}
                onChangeText={setName}
                placeholder={selectedProduct.defaultName}
              />
              <LabeledInput
                label="위치"
                value={room}
                onChangeText={setRoom}
                placeholder={selectedProduct.defaultRoom}
              />
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step !== 'select' && (
            <Pressable style={styles.secondaryButton} onPress={goBack}>
              <Text style={styles.secondaryButtonText}>이전</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.primaryButton, isProvisioning && styles.buttonBusy]}
            onPress={goNext}
            disabled={isProvisioning || isCheckingDeviceWifi}>
            <Text style={styles.primaryButtonText}>
              {isProvisioning
                ? '연결 중'
                : step === 'wifi'
                  ? '연결'
                  : step === 'name'
                    ? '등록 완료'
                    : '다음'}
            </Text>
          </Pressable>
        </View>

        <WifiPasswordModal
          network={passwordNetwork}
          password={password}
          onChangePassword={setPassword}
          onClose={() => {
            setPasswordNetwork(null);
            setPassword('');
          }}
          onConfirm={confirmPassword}
        />
      </SafeAreaView>
    </Modal>
  );
}

function WifiNetworkRow({
  network,
  selected,
  onPress,
}: {
  network: WifiNetwork;
  selected: boolean;
  onPress: () => void;
}) {
  const secured = isSecuredNetwork(network);

  return (
    <Pressable
      style={[styles.networkRow, selected && styles.networkRowSelected]}
      onPress={onPress}>
      <Text style={styles.networkName} numberOfLines={1}>
        {network.ssid}
      </Text>
      <View style={styles.networkRight}>
        {secured && <Text style={styles.lockIcon}>잠금</Text>}
        <Text style={styles.signalIcon}>{signalBars(network.level)}</Text>
        <Text style={styles.infoIcon}>i</Text>
      </View>
      <Text style={styles.networkSub}>
        {getSignalLabel(network.level)} · {network.level} dBm
      </Text>
    </Pressable>
  );
}

function WifiPasswordModal({
  network,
  password,
  onChangePassword,
  onClose,
  onConfirm,
}: {
  network: WifiNetwork | null;
  password: string;
  onChangePassword: (text: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <Modal
      transparent
      visible={Boolean(network)}
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.passwordDialog}>
          <View style={styles.passwordHeader}>
            <Text style={styles.passwordTitle}>Wi-Fi 비밀번호</Text>
            <Pressable onPress={onClose} style={styles.dialogCloseButton}>
              <Text style={styles.dialogCloseText}>x</Text>
            </Pressable>
          </View>
          <Text style={styles.passwordSsid}>{network?.ssid}</Text>
          <View style={styles.passwordInputGroup}>
            <Text style={styles.passwordInputLabel}>비밀번호</Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={onChangePassword}
                placeholder="Wi-Fi password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.passwordEyeButton}
                onPress={() => setPasswordVisible(current => !current)}>
                <Text style={styles.passwordEyeText}>
                  {passwordVisible ? '숨김' : '보기'}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogSecondaryButton} onPress={onClose}>
              <Text style={styles.dialogSecondaryText}>취소</Text>
            </Pressable>
            <Pressable style={styles.dialogPrimaryButton} onPress={onConfirm}>
              <Text style={styles.dialogPrimaryText}>연결</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function signalBars(level: number) {
  if (level >= -55) {
    return '|||';
  }

  if (level >= -70) {
    return '||';
  }

  return '|';
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: (StatusBar.currentHeight ?? 0) + 14,
  },
  closeButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeText: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  title: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '900',
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingBottom: 12,
  },
  progressDot: {
    backgroundColor: '#cbd5e1',
    borderRadius: 4,
    height: 8,
    width: 28,
  },
  progressOn: {
    backgroundColor: '#1d9bf0',
  },
  body: {
    padding: 22,
  },
  lead: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 18,
  },
  productRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 16,
  },
  productRowActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
  },
  productBadge: {
    alignItems: 'center',
    backgroundColor: '#bae6fd',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 14,
    width: 46,
  },
  productBadgeText: {
    color: '#0369a1',
    fontSize: 16,
    fontWeight: '900',
  },
  productCopy: {
    flex: 1,
  },
  productTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  productCaption: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  guidePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
  },
  guideNumber: {
    color: '#1d9bf0',
    fontSize: 38,
    fontWeight: '900',
  },
  guideTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  guideText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
  },
  checkButton: {
    alignItems: 'center',
    backgroundColor: '#1d9bf0',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 48,
  },
  checkButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  currentSsid: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  wifiListHeader: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  wifiTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  refreshText: {
    color: '#0a84ff',
    fontSize: 13,
    fontWeight: '800',
  },
  wifiBandNotice: {
    backgroundColor: '#171717',
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: '#1f2937',
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  errorPanel: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 12,
    padding: 14,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  successPanel: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    marginBottom: 12,
    padding: 14,
  },
  successText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  selectedWifiPanel: {
    backgroundColor: '#dbeafe',
    borderColor: '#0a84ff',
    borderWidth: 1,
  },
  selectedWifiText: {
    color: '#075985',
  },
  wifiList: {
    backgroundColor: '#171717',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 4,
  },
  networkRow: {
    borderBottomColor: '#2a2a2a',
    borderBottomWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  networkRowSelected: {
    backgroundColor: '#0f2745',
    borderColor: '#0a84ff',
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  networkName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    paddingRight: 92,
  },
  networkRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    right: 12,
    top: 8,
  },
  lockIcon: {
    color: '#e5e7eb',
    fontSize: 10,
    fontWeight: '900',
  },
  signalIcon: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '900',
  },
  infoIcon: {
    borderColor: '#0a84ff',
    borderRadius: 9,
    borderWidth: 1,
    color: '#0a84ff',
    fontSize: 11,
    fontWeight: '900',
    height: 18,
    lineHeight: 16,
    textAlign: 'center',
    width: 18,
  },
  networkSub: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  otherNetworkRow: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  otherNetworkText: {
    color: '#f8fafc',
    fontSize: 14,
  },
  footer: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1d9bf0',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '900',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.52)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  passwordDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 18,
    width: '100%',
  },
  passwordHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  passwordTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  dialogCloseButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dialogCloseText: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  passwordSsid: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 14,
    marginTop: 6,
  },
  passwordInputGroup: {
    marginBottom: 16,
  },
  passwordInputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  passwordInputRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
  },
  passwordInput: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
  },
  passwordEyeButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  passwordEyeText: {
    color: '#0a84ff',
    fontSize: 13,
    fontWeight: '900',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
  },
  dialogSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  dialogSecondaryText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '900',
  },
  dialogPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#1d9bf0',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  dialogPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default AddDeviceModal;

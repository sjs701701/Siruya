import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  createDevice,
  getProductDefinition,
  productDefinitions,
} from './deviceRegistry';
import {
  createDemoProvisionedDevice,
  demoDeviceSetupSsid,
  demoHardwareId,
  demoProvisionedIp,
  demoWifiNetworks,
} from './demoDevices';
import {lightScreenBackground, lightScreenBackgroundColor} from './deviceTheme';
import DeviceActionButton from './DeviceActionButton';
import {LabeledInput} from './DeviceFormFields';
import HapticPressable from './HapticPressable';
import {getProductImageSource} from './productAssets';
import {Device, DeviceType, ProvisionStep} from './types';
import {
  connectToDeviceWifi,
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
const demoDelay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));
const productCardSlotWidth = 250;
const productCardGap = 18;
const productCardSnapInterval = productCardSlotWidth + productCardGap;
const modalBodyHorizontalPadding = 22;
const demoDeviceNetwork: WifiNetwork = {
  ssid: demoDeviceSetupSsid,
  level: -36,
  frequency: 2412,
  capabilities: '',
};

function AddDeviceModal({visible, onClose, onAdd}: Props) {
  const productScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const {height: screenHeight, width: screenWidth} = useWindowDimensions();
  const [step, setStep] = useState<ProvisionStep>('select');
  const [selectedType, setSelectedType] = useState<DeviceType>('sprout-grower');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [deviceNetworks, setDeviceNetworks] = useState<WifiNetwork[]>([]);
  const [selectedDeviceNetwork, setSelectedDeviceNetwork] =
    useState<WifiNetwork | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(
    null,
  );
  const [passwordNetwork, setPasswordNetwork] = useState<WifiNetwork | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [currentSsid, setCurrentSsid] = useState('');
  const [isDeviceWifiConnected, setIsDeviceWifiConnected] = useState(false);
  const [isCheckingDeviceWifi, setIsCheckingDeviceWifi] = useState(false);
  const [isScanningDeviceWifi, setIsScanningDeviceWifi] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [deviceScanError, setDeviceScanError] = useState('');
  const [scanError, setScanError] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [provisionedIp, setProvisionedIp] = useState<string | undefined>();
  const [provisionedDeviceId, setProvisionedDeviceId] = useState<
    string | undefined
  >();
  const [provisionedCommandToken, setProvisionedCommandToken] = useState<
    string | undefined
  >();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  const selectedProduct = getProductDefinition(selectedType);
  const productCarouselWidth = Math.max(
    screenWidth - modalBodyHorizontalPadding * 2,
    productCardSlotWidth,
  );
  const productCarouselSidePadding = Math.max(
    (productCarouselWidth - productCardSlotWidth) / 2,
    0,
  );
  const wifiListHeight = Math.max(260, screenHeight - 320);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const defaultProduct = getProductDefinition('sprout-grower');
    setStep('select');
    setSelectedType('sprout-grower');
    setNetworks([]);
    setDeviceNetworks([]);
    setSelectedDeviceNetwork(null);
    setSelectedNetwork(null);
    setPasswordNetwork(null);
    setPassword('');
    setCurrentSsid('');
    setIsDeviceWifiConnected(false);
    setIsProvisioning(false);
    setDeviceScanError('');
    setScanError('');
    setConnectionMessage('');
    setProvisionedIp(undefined);
    setProvisionedDeviceId(undefined);
    setProvisionedCommandToken(undefined);
    setName(defaultProduct.defaultName);
    setRoom(defaultProduct.defaultRoom);
    setIsDemoMode(false);
  }, [visible]);

  useEffect(() => {
    setName(selectedProduct.defaultName);
    setRoom(selectedProduct.defaultRoom);
  }, [selectedProduct]);

  useEffect(() => {
    if (visible && step === 'connect' && isDemoMode) {
      setDeviceNetworks([demoDeviceNetwork]);
      setSelectedDeviceNetwork(demoDeviceNetwork);
      setIsDeviceWifiConnected(true);
      return;
    }

    if (!(visible && step === 'connect')) {
      return;
    }

    if (deviceNetworks.length === 0 && !isScanningDeviceWifi) {
      refreshDeviceWifiList();
    }

    refreshCurrentSsid();

    const currentSsidTimer = setInterval(refreshCurrentSsid, 2500);

    return () => clearInterval(currentSsidTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, isDemoMode, selectedType]);

  useEffect(() => {
    if (visible && step === 'wifi' && isDemoMode) {
      const defaultNetwork = demoWifiNetworks[0];
      setNetworks(demoWifiNetworks);
      setSelectedNetwork(defaultNetwork);
      setPassword('demo1234');
      setConnectionMessage(
        `${defaultNetwork.ssid} 선택됨. 연결 버튼을 누르면 더미 기기가 연결 완료 상태가 됩니다.`,
      );
      return;
    }

    if (visible && step === 'wifi' && networks.length === 0 && !isScanning) {
      refreshWifiList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, isDemoMode]);

  const titleByStep = {
    select: '장치 추가',
    connect: '기기 Wi-Fi 연결',
    wifi: '집 Wi-Fi 선택',
    name: '장치 이름 설정',
  };

  const startDemoFlow = () => {
    const defaultProduct = getProductDefinition('sprout-grower');

    setIsDemoMode(true);
    setStep('connect');
    setSelectedType('sprout-grower');
    setNetworks(demoWifiNetworks);
    setDeviceNetworks([demoDeviceNetwork]);
    setSelectedDeviceNetwork(demoDeviceNetwork);
    setSelectedNetwork(null);
    setPassword('demo1234');
    setCurrentSsid(demoDeviceSetupSsid);
    setIsDeviceWifiConnected(true);
    setDeviceScanError('');
    setScanError('');
    setConnectionMessage('화면 확인용 데모 연결을 시작합니다.');
    setProvisionedIp(undefined);
    setProvisionedDeviceId(undefined);
    setProvisionedCommandToken(undefined);
    setName(defaultProduct.defaultName);
    setRoom(defaultProduct.defaultRoom);
  };

  const refreshCurrentSsid = async () => {
    if (isDemoMode) {
      setCurrentSsid(demoDeviceSetupSsid);
      setIsDeviceWifiConnected(true);
      return demoDeviceSetupSsid;
    }

    const ssid = await getCurrentWifiSsid();
    setCurrentSsid(ssid);
    setIsDeviceWifiConnected(
      isDeviceSetupSsid(ssid, selectedProduct.setupSsidPrefix),
    );
    return ssid;
  };

  const refreshWifiList = async () => {
    if (isDemoMode) {
      setNetworks(demoWifiNetworks);
      setScanError('');
      setConnectionMessage('더미 Wi-Fi 목록을 표시 중입니다.');
      return;
    }

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
    if (isDemoMode) {
      setCurrentSsid(demoDeviceSetupSsid);
      setIsDeviceWifiConnected(true);
      setConnectionMessage(`${demoDeviceSetupSsid}에 연결된 것으로 처리했습니다.`);
      return true;
    }

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

    if (isDemoMode) {
      setIsProvisioning(true);
      setConnectionMessage('더미 기기에 Wi-Fi 정보를 보내는 중입니다...');

      await demoDelay(700);

      setProvisionedIp(demoProvisionedIp);
      setProvisionedDeviceId(demoHardwareId);
      setConnectionMessage(
        `더미 기기가 ${selectedNetwork.ssid}에 연결되었습니다. IP: ${demoProvisionedIp}`,
      );
      setIsProvisioning(false);
      return true;
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
      setProvisionedCommandToken(result.command_token);
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
    if (isDemoMode) {
      return;
    }

    if (!selectedNetwork) {
      try {
        await disconnectFromDeviceWifi(selectedProduct.setupSsidPrefix);
      } catch {
        // The phone may already be away from the device AP.
      }

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

  const closeModal = async () => {
    await returnPhoneToHomeWifi();
    onClose();
  };

  const goBack = () => {
    const index = steps.indexOf(step);
    setStep(steps[Math.max(index - 1, 0)]);
  };

  const goNext = async () => {
    if (step === 'connect' && !isDeviceWifiConnected) {
      return;
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
    const nextDevice = isDemoMode
      ? createDemoProvisionedDevice({
          type: selectedType,
          name,
          room,
          ipAddress: provisionedIp,
          hardwareId: provisionedDeviceId,
          commandToken: provisionedCommandToken,
        })
      : createDevice({
          type: selectedType,
          name,
          room,
          ipAddress: provisionedIp,
          hardwareId: provisionedDeviceId,
          commandToken: provisionedCommandToken,
        });

    onAdd(nextDevice);
    onClose();
  };

  const refreshDeviceWifiList = async () => {
    if (isDemoMode) {
      setDeviceNetworks([demoDeviceNetwork]);
      setSelectedDeviceNetwork(demoDeviceNetwork);
      setDeviceScanError('');
      return;
    }

    setIsScanningDeviceWifi(true);
    setDeviceScanError('');
    setConnectionMessage('');

    try {
      const nextNetworks = await scanWifiNetworks();
      setDeviceNetworks(
        nextNetworks.filter(network =>
          isDeviceSetupSsid(network.ssid, selectedProduct.setupSsidPrefix),
        ),
      );
    } catch (error) {
      setDeviceScanError(
        error instanceof Error && error.message === 'WIFI_PERMISSION_BLOCKED'
          ? 'Wi-Fi 검색 권한이 차단되었습니다. 앱 설정에서 위치 권한을 허용해주세요.'
          : error instanceof Error && error.message === 'WIFI_PERMISSION_DENIED'
            ? 'Wi-Fi 검색 권한이 거부되었습니다.'
            : '기기 Wi-Fi를 검색하지 못했습니다. 휴대폰의 Wi-Fi와 위치 기능이 켜져 있는지 확인해주세요.',
      );
    } finally {
      setIsScanningDeviceWifi(false);
    }
  };

  const connectDeviceNetwork = async (network: WifiNetwork) => {
    setSelectedDeviceNetwork(network);
    setDeviceScanError('');
    setIsDeviceWifiConnected(false);

    if (isDemoMode) {
      setCurrentSsid(network.ssid);
      setIsDeviceWifiConnected(true);
      setConnectionMessage(
        `${network.ssid}에 연결된 것으로 처리했습니다. 다음을 눌러 진행해주세요.`,
      );
      return;
    }

    setIsCheckingDeviceWifi(true);
    setConnectionMessage(`${network.ssid} 연결 중입니다...`);

    try {
      await connectToDeviceWifi(network.ssid);
      const connected = await isConnectedToDeviceWifi(
        selectedProduct.setupSsidPrefix,
      );
      await refreshCurrentSsid();
      setIsDeviceWifiConnected(connected);

      if (!connected) {
        setConnectionMessage('');
        Alert.alert(
          '기기 Wi-Fi 연결 확인 필요',
          `${network.ssid}에 연결되지 않았습니다. 다시 시도하거나 휴대폰 Wi-Fi 설정에서 직접 연결해주세요.`,
        );
        return;
      }

      setConnectionMessage(
        `${network.ssid}에 연결되었습니다. 다음을 눌러 집 Wi-Fi를 선택해주세요.`,
      );
    } catch {
      setIsDeviceWifiConnected(false);
      setConnectionMessage('');
      Alert.alert(
        '기기 Wi-Fi 연결 실패',
        '앱에서 자동 연결하지 못했습니다. 다시 시도하거나 휴대폰 Wi-Fi 설정에서 직접 연결해주세요.',
      );
    } finally {
      setIsCheckingDeviceWifi(false);
    }
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

  const selectProduct = (type: DeviceType, index: number) => {
    setSelectedType(type);
    setDeviceNetworks([]);
    setSelectedDeviceNetwork(null);
    setIsDeviceWifiConnected(false);
    setProvisionedCommandToken(undefined);
    setDeviceScanError('');
    productScrollRef.current?.scrollTo({
      x: index * productCardSnapInterval,
      animated: true,
    });
  };

  const updateSelectedProductFromScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.max(
      0,
      Math.min(
        productDefinitions.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / productCardSnapInterval),
      ),
    );
    setSelectedType(productDefinitions[nextIndex].type);
  };

  const isPrimaryButtonDisabled =
    isProvisioning ||
    isCheckingDeviceWifi ||
    (step === 'connect' && !isDeviceWifiConnected);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={closeModal}
      statusBarTranslucent
      navigationBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={lightScreenBackgroundColor}
        />
        <View style={styles.header}>
          <HapticPressable onPress={closeModal} style={styles.closeButton}>
            <Text style={styles.closeText}>x</Text>
          </HapticPressable>
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

        {step === 'wifi' ? (
          <View style={[styles.contentScroller, styles.body, styles.wifiBody]}>
            {isDemoMode && (
              <View style={styles.demoInlineNotice}>
                <Text style={styles.demoInlineText}>
                  더미 Wi-Fi 목록입니다. 연결 버튼을 누르면 성공 화면으로
                  넘어갑니다.
                </Text>
              </View>
            )}
            <View style={styles.wifiListHeader}>
              <View style={styles.wifiHeaderCopy}>
                <Text style={styles.wifiTitle}>Wi-Fi</Text>
                <Text style={styles.wifiHeaderNotice}>
                  ESP32 연결을 위해 2.4GHz Wi-Fi만 표시합니다.
                </Text>
              </View>
              <HapticPressable onPress={refreshWifiList} disabled={isScanning}>
                <Text style={styles.refreshText}>
                  {isScanning ? '검색 중' : '새로고침'}
                </Text>
              </HapticPressable>
            </View>

            {isScanning && (
              <View style={styles.loadingPanel}>
                <ActivityIndicator size="small" color="#111111" />
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

            <View style={[styles.wifiList, styles.wifiListFill]}>
              <ScrollView
                bounces={false}
                nestedScrollEnabled={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={networks.length > 4}>
                {networks.map(network => (
                  <WifiNetworkRow
                    key={`${network.ssid}-${network.bssid ?? network.level}`}
                    network={network}
                    selected={selectedNetwork?.ssid === network.ssid}
                    onPress={() => selectNetwork(network)}
                  />
                ))}
                <HapticPressable style={styles.otherNetworkRow}>
                  <Text style={styles.otherNetworkText}>기타...</Text>
                </HapticPressable>
              </ScrollView>
            </View>
          </View>
        ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          style={styles.contentScroller}>
          {step === 'select' && (
            <>
              {/* 화면 확인용 데모 패널은 더 이상 노출하지 않습니다. */}
              {false && __DEV__ && (
                <View style={styles.demoPanel}>
                  <Text style={styles.demoTitle}>화면 확인용 데모</Text>
                  <Text style={styles.demoText}>
                    에뮬레이터에서는 실제 기기 Wi-Fi 연결이 어려워 더미 데이터로
                    연결 과정을 끝까지 확인할 수 있습니다.
                  </Text>
                  <HapticPressable
                    style={styles.demoButton}
                    onPress={startDemoFlow}>
                    <Text style={styles.demoButtonText}>
                      데모 연결 흐름 보기
                    </Text>
                  </HapticPressable>
                </View>
              )}

              <View style={styles.productPickerStage}>
                <ScrollView
                  ref={productScrollRef}
                  horizontal
                  contentContainerStyle={[
                    styles.productScroller,
                    {paddingHorizontal: productCarouselSidePadding},
                  ]}
                  decelerationRate="fast"
                  onMomentumScrollEnd={updateSelectedProductFromScroll}
                  showsHorizontalScrollIndicator={false}
                  style={{width: productCarouselWidth}}
                  snapToInterval={productCardSnapInterval}>
                  {productDefinitions.map((product, index) => {
                    const productImage = getProductImageSource(product.type);

                    return (
                      <HapticPressable
                        key={product.type}
                        style={styles.productRow}
                        onPress={() => selectProduct(product.type, index)}>
                        <View style={styles.productImageFrame}>
                          <View style={styles.productBadge}>
                            {productImage ? (
                              <Image
                                source={productImage}
                                resizeMode="contain"
                                style={styles.productImage}
                              />
                            ) : (
                              <Text style={styles.productBadgeText}>
                                {product.badge}
                              </Text>
                            )}
                          </View>
                        </View>
                      </HapticPressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.productDots}>
                  {productDefinitions.map(product => (
                    <View
                      key={product.type}
                      style={[
                        styles.productDot,
                        selectedType === product.type && styles.productDotOn,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.productCopy}>
                  <Text style={styles.productTitle}>
                    {selectedProduct.title}
                  </Text>
                  <Text style={styles.productCaption}>
                    {selectedProduct.caption}
                  </Text>
                </View>
              </View>
            </>
          )}

          {step === 'connect' && (
            <View style={styles.guidePanel}>
              {isDemoMode && (
                <View style={styles.demoBadge}>
                  <Text style={styles.demoBadgeText}>데모 모드</Text>
                </View>
              )}
              <Text style={styles.guideNumber}>1</Text>
              <Text style={styles.guideTitle}>기기 Wi-Fi에 연결</Text>
              <Text style={styles.guideText}>
                {isDemoMode
                  ? `${demoDeviceSetupSsid}에 연결된 상황으로 가정하고 다음 단계 화면을 확인합니다.`
                  : `휴대폰 Wi-Fi 설정에서 ${selectedProduct.setupSsidPrefix}로 시작하는 네트워크를 선택하세요. 연결되지 않으면 다음 단계로 넘어갈 수 없습니다.`}
              </Text>
              {currentSsid.length > 0 && (
                <Text style={styles.currentSsid}>현재 연결: {currentSsid}</Text>
              )}
              <View style={styles.deviceWifiSection}>
                <View style={styles.wifiListHeader}>
                  <Text style={styles.wifiTitle}>기기 Wi-Fi</Text>
                  <HapticPressable
                    onPress={refreshDeviceWifiList}
                    disabled={isScanningDeviceWifi || isCheckingDeviceWifi}>
                    <Text style={styles.refreshText}>
                      {isScanningDeviceWifi ? '검색 중' : '새로고침'}
                    </Text>
                  </HapticPressable>
                </View>
                {isScanningDeviceWifi && (
                  <View style={styles.loadingPanel}>
                    <ActivityIndicator size="small" color="#111111" />
                    <Text style={styles.loadingText}>기기 Wi-Fi 검색 중</Text>
                  </View>
                )}

                {deviceScanError.length > 0 && (
                  <View style={styles.errorPanel}>
                    <Text style={styles.errorText}>{deviceScanError}</Text>
                  </View>
                )}

                <View style={styles.wifiList}>
                  {deviceNetworks.map(network => (
                    <WifiNetworkRow
                      key={`${network.ssid}-${network.bssid ?? network.level}`}
                      network={network}
                      selected={selectedDeviceNetwork?.ssid === network.ssid}
                      disabled={isCheckingDeviceWifi}
                      onPress={() => connectDeviceNetwork(network)}
                    />
                  ))}
                  {deviceNetworks.length === 0 && !isScanningDeviceWifi && (
                    <Text style={styles.emptyWifiText}>
                      검색된 기기 Wi-Fi가 없습니다.
                    </Text>
                  )}
                </View>
                {connectionMessage.length > 0 && (
                  <Text style={styles.deviceConnectionMessage}>
                    {connectionMessage}
                  </Text>
                )}
              </View>
            </View>
          )}

          {false && (
            <>
              {isDemoMode && (
                <View style={styles.demoInlineNotice}>
                  <Text style={styles.demoInlineText}>
                    더미 Wi-Fi 목록입니다. 연결 버튼을 누르면 성공 화면으로
                    넘어갑니다.
                  </Text>
                </View>
              )}
              <View style={styles.wifiListHeader}>
                <View style={styles.wifiHeaderCopy}>
                  <Text style={styles.wifiTitle}>Wi-Fi</Text>
                  <Text style={styles.wifiHeaderNotice}>
                    ESP32 연결을 위해 2.4GHz Wi-Fi만 표시합니다.
                  </Text>
                </View>
                <HapticPressable onPress={refreshWifiList} disabled={isScanning}>
                  <Text style={styles.refreshText}>
                    {isScanning ? '검색 중' : '새로고침'}
                  </Text>
                </HapticPressable>
              </View>
              <Text style={styles.wifiBandNotice}>
                ESP32 연결을 위해 2.4GHz Wi-Fi만 표시됩니다.
              </Text>

              {isScanning && (
                <View style={styles.loadingPanel}>
                  <ActivityIndicator size="small" color="#111111" />
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

              <View style={[styles.wifiList, {height: wifiListHeight}]}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={networks.length > 4}>
                  {networks.map(network => (
                    <WifiNetworkRow
                      key={`${network.ssid}-${network.bssid ?? network.level}`}
                      network={network}
                      selected={selectedNetwork?.ssid === network.ssid}
                      onPress={() => selectNetwork(network)}
                    />
                  ))}
                  <HapticPressable style={styles.otherNetworkRow}>
                    <Text style={styles.otherNetworkText}>기타...</Text>
                  </HapticPressable>
                </ScrollView>
              </View>
            </>
          )}

          {step === 'name' && (
            <>
              {isDemoMode && (
                <View style={styles.demoInlineNotice}>
                  <Text style={styles.demoInlineText}>
                    등록을 완료하면 온라인 상태의 더미 기기가 홈에 추가됩니다.
                  </Text>
                </View>
              )}
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
        )}

        <View
          style={[
            styles.footer,
            {paddingBottom: Math.max(insets.bottom + 18, 18)},
          ]}>
          {step !== 'select' && (
            <DeviceActionButton
              style={styles.secondaryButton}
              useBackdropBlur={false}
              onPress={goBack}>
              <Text style={styles.secondaryButtonText}>이전</Text>
            </DeviceActionButton>
          )}
          <DeviceActionButton
            style={styles.primaryButton}
            useBackdropBlur={false}
            onPress={goNext}
            disabled={isPrimaryButtonDisabled}>
            <Text style={styles.primaryButtonText}>
              {isProvisioning
                ? '연결 중'
                : step === 'wifi'
                  ? '연결'
                  : step === 'name'
                    ? '등록 완료'
                    : '다음'}
            </Text>
          </DeviceActionButton>
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
  disabled = false,
  onPress,
}: {
  network: WifiNetwork;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const secured = isSecuredNetwork(network);

  return (
    <HapticPressable
      disabled={disabled}
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
    </HapticPressable>
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
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.passwordDialog}>
          <View style={styles.passwordHeader}>
            <Text style={styles.passwordTitle}>Wi-Fi 비밀번호</Text>
            <HapticPressable onPress={onClose} style={styles.dialogCloseButton}>
              <Text style={styles.dialogCloseText}>x</Text>
            </HapticPressable>
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
              <HapticPressable
                style={styles.passwordEyeButton}
                onPress={() => setPasswordVisible(current => !current)}>
                <Text style={styles.passwordEyeText}>
                  {passwordVisible ? '숨김' : '보기'}
                </Text>
              </HapticPressable>
            </View>
          </View>
          <View style={styles.dialogActions}>
            <HapticPressable
              style={styles.dialogSecondaryButton}
              onPress={onClose}>
              <Text style={styles.dialogSecondaryText}>취소</Text>
            </HapticPressable>
            <HapticPressable
              style={styles.dialogPrimaryButton}
              onPress={onConfirm}>
              <Text style={styles.dialogPrimaryText}>연결</Text>
            </HapticPressable>
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
    ...lightScreenBackground,
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
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '800',
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
  contentScroller: {
    flex: 1,
  },
  body: {
    padding: 22,
  },
  wifiBody: {
    flex: 1,
  },
  lead: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 18,
  },
  demoPanel: {
    backgroundColor: '#ecfeff',
    borderColor: '#67e8f9',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16,
  },
  demoTitle: {
    color: '#155e75',
    fontSize: 16,
    fontWeight: '700',
  },
  demoText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 6,
  },
  demoButton: {
    alignItems: 'center',
    backgroundColor: '#0891b2',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  demoButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  demoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#cffafe',
    borderRadius: 6,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  demoBadgeText: {
    color: '#155e75',
    fontSize: 12,
    fontWeight: '700',
  },
  demoInlineNotice: {
    backgroundColor: '#ecfeff',
    borderColor: '#a5f3fc',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  demoInlineText: {
    color: '#155e75',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  productPickerStage: {
    alignItems: 'center',
    paddingTop: 12,
  },
  productScroller: {
    alignItems: 'center',
    gap: productCardGap,
  },
  productRow: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    height: 340,
    padding: 0,
    width: productCardSlotWidth,
  },
  productBadge: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    height: 320,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 240,
  },
  productImageFrame: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: 320,
    justifyContent: 'center',
    width: 240,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productBadgeText: {
    color: '#0369a1',
    fontSize: 28,
    fontWeight: '700',
  },
  productDots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
  },
  productDot: {
    backgroundColor: '#c9c9c9',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  productDotOn: {
    backgroundColor: '#ffffff',
  },
  productCopy: {
    alignItems: 'center',
    marginTop: 28,
  },
  productTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  productCaption: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  guidePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
  },
  guideNumber: {
    color: '#1d9bf0',
    fontSize: 38,
    fontWeight: '800',
  },
  guideTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  guideText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
  },
  currentSsid: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  deviceWifiSection: {
    marginTop: 18,
  },
  wifiListHeader: {
    alignItems: 'center',
    backgroundColor: '#d9d9d9',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  wifiHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  wifiTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '800',
  },
  wifiHeaderNotice: {
    color: '#5f5f5f',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  refreshText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
  },
  wifiBandNotice: {
    backgroundColor: '#f4f4f4',
    color: '#5f5f5f',
    display: 'none',
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  loadingText: {
    color: '#5f5f5f',
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
    backgroundColor: '#f4f4f4',
    borderColor: '#111111',
    borderWidth: 1,
  },
  selectedWifiText: {
    color: '#111111',
  },
  deviceConnectionMessage: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 10,
  },
  wifiList: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d9d9',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    paddingBottom: 4,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  wifiListFill: {
    flex: 1,
  },
  emptyWifiText: {
    color: '#6b6b6b',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  networkRow: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e5e5',
    borderTopWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  networkRowSelected: {
    backgroundColor: '#eeeeee',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  networkName: {
    color: '#111111',
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
    top: 10,
  },
  lockIcon: {
    color: '#5f5f5f',
    fontSize: 10,
    fontWeight: '700',
  },
  signalIcon: {
    color: '#5f5f5f',
    fontSize: 12,
    fontWeight: '700',
  },
  infoIcon: {
    borderColor: '#111111',
    borderRadius: 9,
    borderWidth: 1,
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    height: 18,
    lineHeight: 16,
    textAlign: 'center',
    width: 18,
  },
  networkSub: {
    color: '#6b6b6b',
    fontSize: 11,
    marginTop: 2,
  },
  otherNetworkRow: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  otherNetworkText: {
    color: '#111111',
    fontSize: 14,
  },
  footer: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 20,
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  primaryButton: {
    flex: 1,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#3f3f3f',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
  },
  secondaryButtonText: {
    color: '#3f3f3f',
    fontSize: 16,
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '700',
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
  },
});

export default AddDeviceModal;

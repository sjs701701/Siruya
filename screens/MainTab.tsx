import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Video, {ResizeMode} from 'react-native-video';
import AddDeviceModal from '../features/devices/AddDeviceModal';
import AirFlowEffect from '../features/devices/AirFlowEffect';
import DeviceActionButton from '../features/devices/DeviceActionButton';
import DeviceDetailModal from '../features/devices/DeviceDetailModal';
import WaterSupplyGauge from '../features/devices/WaterSupplyGauge';
import {getProductDefinition} from '../features/devices/deviceRegistry';
import {getDeviceStatusLabel} from '../features/devices/deviceStatusLabel';
import {
  lightScreenBackground,
  lightScreenBackgroundColor,
} from '../features/devices/deviceTheme';
import {
  GROWTH_CYCLE_DAYS,
  getGrowthProgress,
} from '../features/devices/growthProgress';
import HapticPressable from '../features/devices/HapticPressable';
import {getProductImageSource} from '../features/devices/productAssets';
import {
  getNextSprayText,
  getWaterCycleProgress,
} from '../features/devices/runtimeDisplay';
import {Device, DeviceStatus} from '../features/devices/types';
import {useDevices} from '../features/devices/useDevices';

const LIGHT_CARD_COLOR = '#dfe1e3';
const FORCE_WATER_SUPPLY_CARD_ACTIVE = false;
const WATER_SUPPLY_CARD_BACKGROUND = require('../assets/images/effects/water-supply-nature.png');
const WATER_SUPPLY_VIDEO_SOURCE = require('../assets/video/water-supply.mp4');

function MainTab() {
  const carouselRef = useRef<ScrollView>(null);
  const {width: screenWidth} = useWindowDimensions();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  const {
    devices,
    selectedDevice,
    onlineCount,
    addDevice,
    updateDevice,
    removeDevice,
    setSelectedDevice,
    loadState,
    persistState,
    retryLoadDevices,
    retryPersistDevices,
  } = useDevices();

  const carouselWidth = Math.max(screenWidth - 54, 280);
  const activeDevice = devices[activeDeviceIndex];
  const storageNotice = useMemo(() => {
    if (loadState.status === 'error') {
      return {
        title:
          loadState.error === 'DEVICE_STORAGE_BACKUP_FAILED'
            ? '저장 데이터 보호가 필요합니다'
            : '기기 목록을 불러오지 못했습니다',
        message:
          loadState.error === 'DEVICE_STORAGE_BACKUP_FAILED'
            ? '기존 정보 보호를 위해 새 저장을 잠시 멈췄습니다.'
            : '이 세션에 추가한 기기는 저장되지 않을 수 있습니다.',
        actionLabel: '재시도',
        onPress: retryLoadDevices,
      };
    }

    if (persistState.status === 'error') {
      return {
        title: '기기 정보 저장에 실패했습니다',
        message: '변경한 내용이 재시작 후 사라질 수 있습니다.',
        actionLabel: '재시도',
        onPress: retryPersistDevices,
      };
    }

    if (
      loadState.status === 'loaded' &&
      loadState.warning === 'DEVICE_STORAGE_RECOVERED_WITH_BACKUP'
    ) {
      return {
        title: '일부 저장 정보를 복구했습니다',
        message: '정상 기기만 불러오고 손상된 정보는 백업했습니다.',
      };
    }

    return null;
  }, [loadState, persistState, retryLoadDevices, retryPersistDevices]);

  useEffect(() => {
    if (devices.length === 0) {
      setActiveDeviceIndex(0);
      return;
    }

    if (activeDeviceIndex >= devices.length) {
      setActiveDeviceIndex(devices.length - 1);
    }
  }, [activeDeviceIndex, devices.length]);

  useEffect(() => {
    carouselRef.current?.scrollTo({
      animated: false,
      x: activeDeviceIndex * carouselWidth,
      y: 0,
    });
  }, [activeDeviceIndex, carouselWidth]);

  const handleDeviceCarouselScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / carouselWidth,
    );
    setActiveDeviceIndex(
      Math.min(Math.max(nextIndex, 0), Math.max(devices.length - 1, 0)),
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={lightScreenBackgroundColor}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.homeLabel}>시루야</Text>
          <Text style={styles.headerSub}>
            연결됨 {onlineCount}대 전체 {devices.length}대
          </Text>
        </View>
        <View style={styles.headerActions}>
          <DeviceActionButton
            accessibilityLabel="알림"
            style={styles.notificationButton}
            contentStyle={styles.notificationButtonContent}
            onPress={() => Alert.alert('알림', '새 알림이 없습니다.')}>
            <View style={styles.iconWrap}>
              <Image
                source={require('../assets/images/main_bell_icon.png')}
                resizeMode="contain"
                style={styles.notificationIcon}
              />
              <View style={styles.notificationBadge} />
            </View>
          </DeviceActionButton>
        </View>
      </View>

      {storageNotice && (
        <View style={styles.storageNotice}>
          <View style={styles.storageNoticeCopy}>
            <Text style={styles.storageNoticeTitle}>
              {storageNotice.title}
            </Text>
            <Text style={styles.storageNoticeMessage}>
              {storageNotice.message}
            </Text>
          </View>
          {'onPress' in storageNotice && (
            <HapticPressable
              accessibilityLabel={storageNotice.actionLabel}
              onPress={storageNotice.onPress}
              style={styles.storageNoticeButton}>
              <Text style={styles.storageNoticeButtonText}>
                {storageNotice.actionLabel}
              </Text>
            </HapticPressable>
          )}
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          devices.length === 0 && styles.emptyContentInner,
        ]}
        scrollEnabled={devices.length === 0}
        showsVerticalScrollIndicator={false}>
        {devices.length > 0 && activeDevice ? (
          <View style={styles.registeredHome}>
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              decelerationRate="fast"
              snapToInterval={carouselWidth}
              showsHorizontalScrollIndicator={false}
              style={[styles.deviceCarousel, {width: carouselWidth}]}
              onMomentumScrollEnd={handleDeviceCarouselScroll}>
              {devices.map(device => (
                <DeviceHeroSlide
                  key={device.id}
                  device={device}
                  width={carouselWidth}
                  onPress={() => setSelectedDevice(device)}
                />
              ))}
            </ScrollView>

            {devices.length > 1 && (
              <View style={styles.carouselDots}>
                {devices.map((device, index) => (
                  <View
                    key={device.id}
                    style={[
                      styles.carouselDot,
                      index === activeDeviceIndex && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            <View style={[styles.metricGrid, {width: carouselWidth}]}>
              <WaterCycleMetricCard device={activeDevice} />

              <View style={styles.sideMetricColumn}>
                <ControlStatusCard
                  active={activeDevice.controls.fan}
                  effect="airflow"
                  title="팬 작동"
                  tone="dark"
                />
                <ControlStatusCard
                  active={
                    FORCE_WATER_SUPPLY_CARD_ACTIVE || activeDevice.controls.water
                  }
                  effect="waterVideo"
                  title="물 공급"
                  tone="light"
                />
              </View>
            </View>

            <GrowthProgressCard device={activeDevice} width={carouselWidth} />
          </View>
        ) : (
          <View style={styles.emptyHome}>
            <Text style={styles.emptyTitle}>등록된 기기가 없습니다</Text>
            <Text style={styles.emptyText}>
              장치를 추가하면 홈에서 제품 상태와 성장 진행을 확인할 수
              있습니다.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.addDeviceDock}>
        <DeviceActionButton
          accessibilityLabel="장치 추가"
          contentStyle={styles.addDeviceButtonContent}
          style={styles.addDeviceButton}
          onPress={() => setIsAddOpen(true)}>
          <Text style={styles.addDeviceIcon}>+</Text>
          <Text style={styles.addDeviceText}>장치 추가</Text>
        </DeviceActionButton>
      </View>

      <AddDeviceModal
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addDevice}
      />
      <DeviceDetailModal
        device={selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onUpdate={updateDevice}
        onRemove={removeDevice}
      />
    </SafeAreaView>
  );
}

function DeviceHeroSlide({
  device,
  onPress,
  width,
}: {
  device: Device;
  onPress: () => void;
  width: number;
}) {
  const product = getProductDefinition(device.type);
  const productImage = getProductImageSource(device.type);

  return (
    <HapticPressable
      accessibilityLabel={`${device.name} 상세 보기`}
      onPress={onPress}
      style={[styles.heroSlide, {width}]}>
      <View style={styles.heroCard}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroRoom} numberOfLines={1}>
            {device.room}
          </Text>
          <Text style={styles.heroName} numberOfLines={1}>
            {device.name}
          </Text>
        </View>
        <DeviceStatusBadge status={device.status} />
        <View style={styles.heroImageStage}>
          {productImage ? (
            <Image
              source={productImage}
              resizeMode="contain"
              style={styles.heroProductImage}
            />
          ) : (
            <View style={styles.productImageFallback}>
              <Text style={styles.productImageFallbackText}>
                {product.badge}
              </Text>
            </View>
          )}
        </View>
      </View>
    </HapticPressable>
  );
}

function DeviceStatusBadge({status}: {status: DeviceStatus}) {
  const isOnline = status === 'online';

  return (
    <View
      style={[
        styles.statusBadge,
        isOnline ? styles.statusBadgeOnline : styles.statusBadgeMuted,
      ]}>
      <Text
        style={[
          styles.statusBadgeText,
          isOnline ? styles.statusBadgeTextOnline : styles.statusBadgeTextMuted,
        ]}>
        {getDeviceStatusLabel(status)}
      </Text>
    </View>
  );
}

function WaterCycleMetricCard({device}: {device: Device}) {
  const [now, setNow] = useState(Date.now());
  const nextSprayText = useMemo(
    () => getNextSprayText(device.runtime, now),
    [device.runtime, now],
  );
  const waterCycleProgress = useMemo(
    () => getWaterCycleProgress(device.runtime, now),
    [device.runtime, now],
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.metricCard, styles.waterCycleCard]}>
      <Text style={styles.metricTitle}>물 공급주기</Text>
      <View style={styles.waterGaugeSlot}>
        <WaterSupplyGauge
          backgroundColor={LIGHT_CARD_COLOR}
          progress={waterCycleProgress}
          value={nextSprayText}
        />
      </View>
    </View>
  );
}

function GrowthProgressCard({device, width}: {device: Device; width: number}) {
  const growth = useMemo(
    () => getGrowthProgress(device.growthStartedAt),
    [device.growthStartedAt],
  );

  return (
    <View style={[styles.growthCard, {width}]}>
      <Text style={styles.metricTitle}>성장 진행</Text>
      <View style={styles.growthLabels}>
        <Text style={styles.growthLabel}>시작</Text>
        <Text style={styles.growthLabel}>{GROWTH_CYCLE_DAYS}일</Text>
      </View>
      <View style={styles.growthTrack}>
        <View
          style={[
            styles.growthFill,
            {width: `${growth.progressPercent}%`},
          ]}
        />
      </View>
    </View>
  );
}

function ControlStatusCard({
  active,
  effect,
  title,
  tone,
}: {
  active: boolean;
  effect?: 'airflow' | 'waterVideo';
  title: string;
  tone: 'dark' | 'light';
}) {
  const isDark = tone === 'dark';
  const isImageBacked = effect === 'waterVideo';

  return (
    <View
      style={[
        styles.controlCard,
        isDark ? styles.controlCardDark : styles.controlCardLight,
      ]}>
      {isImageBacked && (
        <>
          <Image
            resizeMode="cover"
            source={WATER_SUPPLY_CARD_BACKGROUND}
            style={[
              styles.waterSupplyImage,
              !active && styles.waterSupplyInactiveMedia,
            ]}
          />
          <Video
            controls={false}
            muted
            paused={!active}
            repeat
            resizeMode={ResizeMode.COVER}
            source={WATER_SUPPLY_VIDEO_SOURCE}
            style={[
              styles.waterSupplyVideo,
              !active && styles.waterSupplyInactiveMedia,
            ]}
          />
          <View style={styles.waterSupplyImageOverlay} />
        </>
      )}
      {effect === 'airflow' && (
        <AirFlowEffect active={active} style={styles.airFlowLayer} />
      )}
      <View style={styles.controlHeader}>
        <Text
          numberOfLines={1}
          style={[
            styles.metricTitle,
            (isDark || isImageBacked) && styles.metricTitleOnDark,
          ]}>
          {title}
        </Text>
        <ControlStatusBadge active={active} />
      </View>
    </View>
  );
}

function ControlStatusBadge({active}: {active: boolean}) {
  return (
    <View
      style={[
        styles.controlStatusBadge,
        active ? styles.controlStatusBadgeOn : styles.controlStatusBadgeOff,
      ]}>
      <Text
        style={[
          styles.controlStatusText,
          active ? styles.controlStatusTextOn : styles.controlStatusTextOff,
        ]}>
        {active ? '켜짐' : '꺼짐'}
      </Text>
    </View>
  );
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
    paddingBottom: 8,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  homeLabel: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  headerSub: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
  },
  storageNotice: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 8,
    marginHorizontal: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  storageNoticeCopy: {
    flex: 1,
    gap: 3,
  },
  storageNoticeTitle: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  storageNoticeMessage: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  storageNoticeButton: {
    alignItems: 'center',
    backgroundColor: '#2f2f2f',
    borderRadius: 9,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  storageNoticeButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  notificationButton: {
    borderRadius: 23,
    height: 46,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 46,
  },
  notificationButtonContent: {
    height: '100%',
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  notificationIcon: {
    height: 20,
    tintColor: '#323232',
    width: 20,
  },
  notificationBadge: {
    backgroundColor: '#d60000',
    borderRadius: 4.5,
    boxShadow: [
      {
        blurRadius: 2,
        color: 'rgba(0,0,0,0.4)',
        inset: true,
        offsetX: -1,
        offsetY: -1,
      },
      {
        blurRadius: 1,
        color: 'rgba(255,255,255,0.8)',
        inset: true,
        offsetX: 1,
        offsetY: 1,
      },
      {
        blurRadius: 2,
        color: 'rgba(0,0,0,0.5)',
        offsetX: 1,
        offsetY: 1,
      },
    ],
    experimental_backgroundImage:
      'radial-gradient(circle at 30% 30%, #ff8a8a, #d60000)',
    height: 9,
    pointerEvents: 'none',
    position: 'absolute',
    right: -2,
    top: -2,
    width: 9,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 4,
    paddingHorizontal: 18,
    paddingTop: 2,
  },
  emptyContentInner: {
    justifyContent: 'center',
  },
  registeredHome: {
    alignItems: 'center',
    width: '100%',
  },
  deviceCarousel: {
    alignSelf: 'center',
    flexGrow: 0,
  },
  heroSlide: {
    paddingHorizontal: 0,
  },
  heroCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    boxShadow: [
      {
        blurRadius: 22,
        color: 'rgba(20,20,20,0.18)',
        offsetX: 0,
        offsetY: 16,
        spreadDistance: -10,
      },
    ],
    experimental_backgroundImage:
      'linear-gradient(to bottom right, #1e1e1e, #525252)',
    height: 286,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroCopy: {
    left: 16,
    maxWidth: '67%',
    position: 'absolute',
    top: 18,
    zIndex: 2,
  },
  heroRoom: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.9,
  },
  heroName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 4,
  },
  heroImageStage: {
    alignItems: 'center',
    bottom: 10,
    justifyContent: 'center',
    left: 22,
    position: 'absolute',
    right: 22,
    top: 72,
  },
  heroProductImage: {
    height: '100%',
    width: '90%',
  },
  productImageFallback: {
    alignItems: 'center',
    backgroundColor: '#9ca3af',
    height: 112,
    justifyContent: 'center',
    width: 90,
  },
  productImageFallbackText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    right: 14,
    top: 18,
    zIndex: 3,
  },
  statusBadgeOnline: {
    backgroundColor: '#19d832',
  },
  statusBadgeMuted: {
    backgroundColor: '#e5e7eb',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  statusBadgeTextOnline: {
    color: '#ffffff',
  },
  statusBadgeTextMuted: {
    color: '#374151',
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
    height: 10,
    justifyContent: 'center',
    marginTop: 10,
  },
  carouselDot: {
    backgroundColor: '#cfd4d8',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  carouselDotActive: {
    backgroundColor: '#232323',
    width: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
  },
  metricCard: {
    backgroundColor: LIGHT_CARD_COLOR,
    borderRadius: 16,
    boxShadow: [
      {
        blurRadius: 20,
        color: 'rgba(0,0,0,0.11)',
        offsetX: 0,
        offsetY: 14,
        spreadDistance: -13,
      },
    ],
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  waterCycleCard: {
    flex: 1,
    height: 192,
  },
  metricTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricTitleOnDark: {
    color: '#ffffff',
  },
  waterGaugeSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  sideMetricColumn: {
    flex: 1,
    gap: 12,
  },
  controlCard: {
    borderRadius: 16,
    flex: 1,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 13,
    position: 'relative',
  },
  controlCardDark: {
    backgroundColor: '#060A0D',
    boxShadow: [
      {
        blurRadius: 18,
        color: 'rgba(0,0,0,0.16)',
        offsetX: 0,
        offsetY: 12,
        spreadDistance: -12,
      },
    ],
    experimental_backgroundImage:
      'radial-gradient(50% 50% at 50% 50%, #263648 0%, #060A0D 100%)',
  },
  controlCardLight: {
    backgroundColor: LIGHT_CARD_COLOR,
    boxShadow: [
      {
        blurRadius: 20,
        color: 'rgba(0,0,0,0.11)',
        offsetX: 0,
        offsetY: 14,
        spreadDistance: -13,
      },
    ],
  },
  controlHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  airFlowLayer: {
    bottom: 0,
    height: 62,
    left: 0,
    opacity: 0.95,
    position: 'absolute',
    right: 0,
  },
  waterSupplyImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  waterSupplyVideo: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  waterSupplyImageOverlay: {
    backgroundColor: 'rgba(5, 12, 8, 0.22)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  waterSupplyInactiveMedia: {
    filter: [{blur: 3}],
    transform: [{scale: 1.03}],
  },
  controlStatusBadge: {
    borderRadius: 999,
    minWidth: 28,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  controlStatusBadgeOn: {
    backgroundColor: '#19d832',
  },
  controlStatusBadgeOff: {
    backgroundColor: '#d1d5db',
  },
  controlStatusText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
    textAlign: 'center',
  },
  controlStatusTextOn: {
    color: '#ffffff',
  },
  controlStatusTextOff: {
    color: '#4b5563',
  },
  growthCard: {
    backgroundColor: LIGHT_CARD_COLOR,
    borderRadius: 16,
    boxShadow: [
      {
        blurRadius: 20,
        color: 'rgba(0,0,0,0.11)',
        offsetX: 0,
        offsetY: 14,
        spreadDistance: -13,
      },
    ],
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  growthLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  growthLabel: {
    color: '#4b5563',
    fontSize: 9,
    fontWeight: '800',
  },
  growthTrack: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 18,
    marginTop: 5,
    overflow: 'hidden',
  },
  growthFill: {
    backgroundColor: '#73ff35',
    borderRadius: 999,
    height: '100%',
  },
  emptyHome: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    textAlign: 'center',
  },
  addDeviceDock: {
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  addDeviceButton: {
    width: '100%',
  },
  addDeviceButtonContent: {
    flexDirection: 'row',
    gap: 8,
  },
  addDeviceIcon: {
    color: '#323232',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  addDeviceText: {
    color: '#323232',
    fontSize: 17,
    fontWeight: '900',
  },
});

export default MainTab;

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import Video, {ResizeMode} from 'react-native-video';
import AirFlowEffect from './AirFlowEffect';
import {sendDeviceCommand} from './deviceCommands';
import {getDeviceControlBlockReason} from './deviceControl';
import {
  getCommandFailureMessage,
  getControlBlockedMessage,
} from './deviceControlMessages';
import HapticPressable, {triggerToggleHaptic} from './HapticPressable';
import {type Device, type DeviceCommand, type DeviceUpdater} from './types';

const WATER_SUPPLY_CARD_BACKGROUND = require('../../assets/images/effects/water-supply-nature.png');
const WATER_SUPPLY_VIDEO_SOURCE = require('../../assets/video/water-supply.mp4');
const SLIDER_THUMB_SIZE = 58;
const SLIDER_HORIZONTAL_PADDING = 6;

type ControlCommand = Extract<DeviceCommand, 'fan' | 'water'>;

type Props = {
  command: ControlCommand | null;
  device: Device | null;
  onClose: () => void;
  onUpdate: DeviceUpdater;
  visible: boolean;
};

function getControlTitle(command: ControlCommand) {
  return command === 'fan' ? '팬 작동' : '물 공급';
}

function ControlActionModal({
  command,
  device,
  onClose,
  onUpdate,
  visible,
}: Props) {
  const {width: screenWidth} = useWindowDimensions();
  const [pending, setPending] = useState(false);

  if (!visible || !device || !command) {
    return null;
  }

  const active = device.controls[command];
  const title = getControlTitle(command);
  const modalWidth = Math.min(screenWidth - 36, 380);

  const runCommand = async () => {
    if (pending) {
      return;
    }

    const blockReason = getDeviceControlBlockReason(device);

    if (blockReason) {
      Alert.alert('기기 제어 불가', getControlBlockedMessage(blockReason));
      return;
    }

    const nextValue = !active;
    setPending(true);

    try {
      await sendDeviceCommand({command, device, value: nextValue});
      triggerToggleHaptic(nextValue);
      onUpdate(device.id, current => ({
        ...current,
        status: 'online',
        controls: {
          ...current.controls,
          [command]: nextValue,
        },
      }));
    } catch (error) {
      Alert.alert('명령 전송 실패', getCommandFailureMessage(error));
      onUpdate(device.id, current => ({
        ...current,
        status: 'offline',
      }));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.root}>
        <BlurView
          blurAmount={16}
          blurType="dark"
          overlayColor="transparent"
          pointerEvents="none"
          reducedTransparencyFallbackColor="rgba(10,10,10,0.82)"
          style={StyleSheet.absoluteFill}
        />
        <HapticPressable
          accessibilityLabel="제어 팝업 닫기"
          onPress={onClose}
          style={styles.backdrop}
        />

        <View style={[styles.sheet, {width: modalWidth}]}>
          <BlurView
            blurAmount={22}
            blurType="light"
            overlayColor="transparent"
            pointerEvents="none"
            reducedTransparencyFallbackColor="#eff2f5"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.sheetTint} />

          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>{device.name}</Text>
              <Text style={styles.sheetTitle}>{title}</Text>
            </View>
            <HapticPressable
              accessibilityLabel="닫기"
              onPress={onClose}
              style={styles.closeButton}>
              <Text style={styles.closeText}>x</Text>
            </HapticPressable>
          </View>

          <ControlPreview
            active={active}
            command={command}
            onClose={onClose}
            title={title}
          />

          <View style={styles.sliderSection}>
            <Text style={styles.sliderCaption}>
              {active ? '현재 켜짐 상태입니다' : '현재 꺼짐 상태입니다'}
            </Text>
            <SlideCommandControl
              active={active}
              pending={pending}
              onSlideComplete={runCommand}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ControlPreview({
  active,
  command,
  onClose,
  title,
}: {
  active: boolean;
  command: ControlCommand;
  onClose: () => void;
  title: string;
}) {
  const isFan = command === 'fan';

  return (
    <View
      style={[
        styles.previewCard,
        isFan ? styles.previewCardFan : styles.previewCardWater,
      ]}>
      {!isFan && (
        <>
          <Image
            resizeMode="cover"
            source={WATER_SUPPLY_CARD_BACKGROUND}
            style={styles.previewWaterImage}
          />
          <Video
            controls={false}
            muted
            paused={!active}
            repeat
            resizeMode={ResizeMode.COVER}
            source={WATER_SUPPLY_VIDEO_SOURCE}
            style={styles.previewWaterVideo}
          />
          {!active && <View style={styles.previewInactiveOverlay} />}
        </>
      )}
      {isFan && <AirFlowEffect active={active} style={styles.previewAirFlow} />}
      <View style={styles.previewHeader}>
        <Text
          style={[
            styles.previewTitle,
            styles.previewTitleOnDark,
          ]}>
          {title}
        </Text>
        <HapticPressable
          accessibilityLabel="닫기"
          onPress={onClose}
          style={styles.previewCloseButton}>
          <Text style={styles.previewCloseText}>x</Text>
        </HapticPressable>
      </View>
    </View>
  );
}

function SlideCommandControl({
  active,
  onSlideComplete,
  pending,
}: {
  active: boolean;
  onSlideComplete: () => Promise<void>;
  pending: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const lastMaxTranslateXRef = useRef(0);
  const maxTranslateX = Math.max(
    trackWidth - SLIDER_THUMB_SIZE - SLIDER_HORIZONTAL_PADDING * 2,
    0,
  );
  const isTrackMeasured = maxTranslateX > 0;
  const restingX = active ? maxTranslateX : 0;
  const commitX = active ? 0 : maxTranslateX;
  const resetThumb = useCallback(() => {
    Animated.spring(translateX, {
      damping: 18,
      mass: 0.8,
      stiffness: 180,
      toValue: restingX,
      useNativeDriver: true,
    }).start();
  }, [restingX, translateX]);

  // 레이아웃 측정 직후에는 애니메이션 없이 제자리에 두고,
  // 상태(active)가 실제로 바뀐 경우에만 스프링으로 이동한다.
  // 이렇게 하지 않으면 켜진 상태로 팝업을 열 때 썸이 왼쪽에서
  // 날아와 자리잡는 모션이 보인다.
  useEffect(() => {
    const layoutChanged = lastMaxTranslateXRef.current !== maxTranslateX;
    lastMaxTranslateXRef.current = maxTranslateX;

    if (pending) {
      return;
    }

    if (layoutChanged) {
      translateX.setValue(restingX);
      return;
    }

    resetThumb();
  }, [maxTranslateX, pending, resetThumb, restingX, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !pending && maxTranslateX > 0 && Math.abs(gestureState.dx) > 4,
        onStartShouldSetPanResponder: () => !pending && maxTranslateX > 0,
        onPanResponderMove: (_, gestureState) => {
          const nextX = Math.min(
            Math.max(restingX + gestureState.dx, 0),
            maxTranslateX,
          );
          translateX.setValue(nextX);
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldCommit = active
            ? gestureState.dx <= -maxTranslateX * 0.72
            : gestureState.dx >= maxTranslateX * 0.72;

          if (shouldCommit) {
            Animated.timing(translateX, {
              duration: 140,
              toValue: commitX,
              useNativeDriver: true,
            }).start(() => {
              void onSlideComplete();
            });
            return;
          }

          resetThumb();
        },
        onPanResponderTerminate: () => {
          resetThumb();
        },
      }),
    [
      active,
      commitX,
      maxTranslateX,
      onSlideComplete,
      pending,
      resetThumb,
      restingX,
      translateX,
    ],
  );

  const instruction = active ? '밀어서 끄기' : '밀어서 켜기';
  const thumbArrow = active ? '‹' : '›';
  // 썸 뒤꽁무니까지 덮으며 따라오는 초록 채움 레이어.
  // 끝까지 밀면 반투명한 썸 아래와 오른쪽 패딩까지 트랙 전체가
  // 빈틈 없이 채워져서 "켜짐"이 완성된 모양으로 보인다.
  const fillTranslateX = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, Math.max(maxTranslateX, 1)],
    outputRange: [
      SLIDER_THUMB_SIZE + SLIDER_HORIZONTAL_PADDING * 2 - trackWidth,
      0,
    ],
  });
  const fillOpacity = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, Math.max(maxTranslateX, 1)],
    outputRange: [0, 1],
  });

  return (
    <View
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      style={[styles.sliderTrack, pending && styles.sliderTrackPending]}>
      <View pointerEvents="none" style={styles.sliderGlow} />
      {isTrackMeasured && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sliderFill,
            {
              opacity: fillOpacity,
              transform: [{translateX: fillTranslateX}],
              width: trackWidth,
            },
          ]}
        />
      )}
      <Text style={styles.sliderText}>{pending ? '전송 중' : instruction}</Text>
      {pending && <ActivityIndicator color="#ffffff" style={styles.spinner} />}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sliderThumb,
          !isTrackMeasured && styles.sliderThumbHidden,
          {
            transform: [{translateX}],
          },
        ]}>
        <Text
          style={[
            styles.sliderThumbText,
            active && styles.sliderThumbTextActive,
          ]}>
          {thumbArrow}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: [
      {
        blurRadius: 34,
        color: 'rgba(0,0,0,0.28)',
        offsetX: 0,
        offsetY: 18,
        spreadDistance: -8,
      },
    ],
    overflow: 'hidden',
    padding: 16,
  },
  sheetTint: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetHeader: {
    alignItems: 'center',
    display: 'none',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
    zIndex: 1,
  },
  sheetEyebrow: {
    color: '#5b6470',
    fontSize: 12,
    fontWeight: '600',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeText: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 23,
  },
  previewCard: {
    borderRadius: 22,
    height: 224,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 17,
    position: 'relative',
    zIndex: 1,
  },
  previewCardFan: {
    backgroundColor: '#060A0D',
    experimental_backgroundImage:
      'radial-gradient(50% 50% at 50% 50%, #263648 0%, #060A0D 100%)',
  },
  previewCardWater: {
    backgroundColor: '#dfe1e3',
  },
  previewWaterImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  previewWaterVideo: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  previewInactiveOverlay: {
    backgroundColor: 'rgba(5, 12, 8, 0.22)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  previewAirFlow: {
    bottom: 0,
    height: 146,
    left: 0,
    opacity: 0.98,
    position: 'absolute',
    right: 0,
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  previewTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  previewTitleOnDark: {
    color: '#ffffff',
  },
  previewCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  previewCloseText: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 21,
  },
  sliderSection: {
    marginTop: 18,
    zIndex: 1,
  },
  sliderCaption: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 9,
    textAlign: 'center',
  },
  sliderTrack: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 20, 24, 0.86)',
    borderColor: 'rgba(255,255,255,0.36)',
    borderRadius: 999,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sliderTrackPending: {
    opacity: 0.82,
  },
  sliderGlow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 5,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 5,
    borderRadius: 999,
    boxShadow: [
      {
        blurRadius: 2,
        color: 'rgba(255,255,255,0.22)',
        inset: true,
        offsetX: 0,
        offsetY: 1,
      },
      {
        blurRadius: 8,
        color: 'rgba(0,0,0,0.32)',
        inset: true,
        offsetX: 0,
        offsetY: -3,
      },
    ],
  },
  sliderFill: {
    borderBottomRightRadius: 999,
    borderTopRightRadius: 999,
    bottom: 0,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(18,197,72,0) 0%, rgba(18,197,72,0.45) 52%, #15d84f 100%)',
    left: 0,
    position: 'absolute',
    top: 0,
  },
  sliderText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  spinner: {
    position: 'absolute',
    right: 25,
  },
  sliderThumb: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: SLIDER_THUMB_SIZE / 2,
    boxShadow: [
      {
        blurRadius: 14,
        color: 'rgba(0,0,0,0.3)',
        offsetX: 0,
        offsetY: 8,
        spreadDistance: -4,
      },
    ],
    height: SLIDER_THUMB_SIZE,
    justifyContent: 'center',
    left: SLIDER_HORIZONTAL_PADDING,
    position: 'absolute',
    top: SLIDER_HORIZONTAL_PADDING,
    width: SLIDER_THUMB_SIZE,
  },
  sliderThumbHidden: {
    opacity: 0,
  },
  sliderThumbText: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 36,
    marginLeft: 2,
  },
  sliderThumbTextActive: {
    color: '#0ca33c',
  },
});

export default ControlActionModal;

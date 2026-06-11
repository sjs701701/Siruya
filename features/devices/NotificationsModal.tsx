import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Animated,
  LayoutAnimation,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import HapticPressable, {triggerWheelTickHaptic} from './HapticPressable';
import {type AppNotification, formatNotificationTime} from './notifications';

const SWIPE_ACTIVATE_DISTANCE = 5;
const SWIPE_DIRECTION_LOCK_RATIO = 1.15;
const SWIPE_DISMISS_MIN_DISTANCE = 72;
const SWIPE_DISMISS_VELOCITY = 0.55;

type Props = {
  notifications: AppNotification[];
  onClearAll: () => void;
  onClose: () => void;
  onDismiss: (id: string) => void;
  visible: boolean;
};

function NotificationsModal({
  notifications,
  onClearAll,
  onClose,
  onDismiss,
  visible,
}: Props) {
  const [isRowSwiping, setIsRowSwiping] = useState(false);

  if (!visible) {
    return null;
  }

  const now = Date.now();
  const hasNotifications = notifications.length > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.root}>
        <HapticPressable
          accessibilityLabel="알림창 닫기"
          onPress={onClose}
          style={styles.backdrop}
        />

        <View style={styles.panel}>
          <BlurView
            blurAmount={22}
            blurType="light"
            overlayColor="transparent"
            pointerEvents="none"
            reducedTransparencyFallbackColor="#eff2f5"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.panelTint} />

          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>알림</Text>
            <HapticPressable
              accessibilityLabel="닫기"
              onPress={onClose}
              style={styles.closeButton}>
              <Text style={styles.closeText}>x</Text>
            </HapticPressable>
          </View>

          {hasNotifications ? (
            <>
              <ScrollView
                contentContainerStyle={styles.listContent}
                directionalLockEnabled
                keyboardShouldPersistTaps="handled"
                scrollEnabled={!isRowSwiping}
                showsVerticalScrollIndicator={false}
                style={styles.listScroll}>
                <View style={styles.list}>
                  {notifications.map(notification => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      now={now}
                      onDismiss={onDismiss}
                      onSwipeActiveChange={setIsRowSwiping}
                    />
                  ))}
                </View>
              </ScrollView>
              <HapticPressable
                accessibilityLabel="알림 모두 지우기"
                onPress={onClearAll}
                style={styles.clearButton}>
                <Text style={styles.clearButtonText}>모두 지우기</Text>
              </HapticPressable>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>새 알림이 없습니다</Text>
              <Text style={styles.emptyMessage}>
                기기 알림이 도착하면 여기에 표시됩니다.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function isLeftSwipeGesture(gestureState: PanResponderGestureState) {
  return (
    gestureState.dx < -SWIPE_ACTIVATE_DISTANCE &&
    Math.abs(gestureState.dx) >
      Math.abs(gestureState.dy) * SWIPE_DIRECTION_LOCK_RATIO
  );
}

function getClampedSwipeOffset(dx: number, rowWidth: number) {
  const maxOffset = rowWidth || 360;

  return Math.max(Math.min(dx, 0), -maxOffset);
}

function NotificationItem({
  notification,
  now,
  onDismiss,
  onSwipeActiveChange,
}: {
  notification: AppNotification;
  now: number;
  onDismiss: (id: string) => void;
  onSwipeActiveChange: (active: boolean) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [rowWidth, setRowWidth] = useState(0);
  const isRemovingRef = useRef(false);

  const removeRow = useCallback(() => {
    if (isRemovingRef.current) {
      return;
    }

    isRemovingRef.current = true;
    onSwipeActiveChange(false);
    triggerWheelTickHaptic();
    Animated.timing(translateX, {
      duration: 170,
      toValue: -(rowWidth || 360),
      useNativeDriver: true,
    }).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onDismiss(notification.id);
    });
  }, [notification.id, onDismiss, onSwipeActiveChange, rowWidth, translateX]);

  const springBack = useCallback(() => {
    if (isRemovingRef.current) {
      return;
    }

    onSwipeActiveChange(false);
    Animated.spring(translateX, {
      damping: 20,
      mass: 0.8,
      stiffness: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [onSwipeActiveChange, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 왼쪽으로 끄는 제스처를 캡처 단계에서 먼저 잡아
        // 세로 ScrollView가 가로 스와이프를 가로채지 못하게 한다.
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !isRemovingRef.current && isLeftSwipeGesture(gestureState),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          !isRemovingRef.current && isLeftSwipeGesture(gestureState),
        // 스와이프 도중 ScrollView가 제스처를 회수하지 못하게 한다.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_, gestureState) => {
          translateX.stopAnimation();
          onSwipeActiveChange(true);
          translateX.setValue(getClampedSwipeOffset(gestureState.dx, rowWidth));
        },
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(getClampedSwipeOffset(gestureState.dx, rowWidth));
        },
        onPanResponderRelease: (_, gestureState) => {
          const passedDistance =
            gestureState.dx <
            -Math.max(rowWidth * 0.22, SWIPE_DISMISS_MIN_DISTANCE);
          const flungLeft = gestureState.vx < -SWIPE_DISMISS_VELOCITY;

          if (passedDistance || flungLeft) {
            removeRow();
            return;
          }

          springBack();
        },
        onPanResponderTerminate: () => {
          springBack();
        },
      }),
    [onSwipeActiveChange, removeRow, rowWidth, springBack, translateX],
  );

  const deleteLayerOpacity = translateX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-SWIPE_DISMISS_MIN_DISTANCE, -12, 0],
    outputRange: [1, 0.35, 0],
  });

  return (
    <View
      onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
      style={styles.itemWrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.itemDeleteLayer, {opacity: deleteLayerOpacity}]}>
        <Text style={styles.itemDeleteText}>지우기</Text>
      </Animated.View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.item, {transform: [{translateX}]}]}>
        <View style={styles.itemDot} />
        <View style={styles.itemCopy}>
          <View style={styles.itemTitleRow}>
            <Text numberOfLines={1} style={styles.itemTitle}>
              {notification.title}
            </Text>
            <Text style={styles.itemTime}>
              {formatNotificationTime(notification.createdAt, now)}
            </Text>
          </View>
          <Text style={styles.itemMessage}>{notification.message}</Text>
        </View>
        <HapticPressable
          accessibilityLabel={`${notification.title} 알림 지우기`}
          hitSlop={6}
          onPress={removeRow}
          style={styles.itemDismiss}>
          <Text style={styles.itemDismissText}>x</Text>
        </HapticPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingBottom: 22,
    paddingHorizontal: 14,
    paddingTop: 58,
  },
  backdrop: {
    backgroundColor: '#15181c',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  panel: {
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
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
  panelTint: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 1,
  },
  panelTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
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
  listScroll: {
    flex: 1,
    zIndex: 1,
  },
  listContent: {
    paddingBottom: 4,
  },
  list: {
    gap: 10,
  },
  itemWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  itemDeleteLayer: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(230,0,18,0.6)',
    borderRadius: 16,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingRight: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  itemDeleteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  item: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  itemDot: {
    backgroundColor: '#15d84f',
    borderRadius: 4,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  itemCopy: {
    flex: 1,
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: '#111827',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  itemTime: {
    color: '#5b6470',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 8,
  },
  itemMessage: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 3,
  },
  itemDismiss: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  itemDismissText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.82)',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
    zIndex: 1,
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
    zIndex: 1,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyMessage: {
    color: '#5b6470',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
});

export default NotificationsModal;

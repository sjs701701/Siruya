import React, {useCallback, useEffect, useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {triggerWheelTickHaptic} from './HapticPressable';

export const ODOMETER_WHEEL_ITEM_HEIGHT = 44;
export const ODOMETER_WHEEL_VISIBLE_ITEMS = 5;

// 드럼 곡률 계산에 쓰는 중심으로부터의 최대 행 거리.
const EDGE_DISTANCE = (ODOMETER_WHEEL_VISIBLE_ITEMS + 0.2) / 2;
const UNIT_LABEL_SPACE = 36;

type SharedScrollValue = {value: number};

type OdometerWheelProps = {
  onSettled: (index: number) => void;
  selectedIndex: number;
  unitLabel?: string;
  values: readonly string[];
};

function clampIndex(index: number, maxIndex: number) {
  return Math.min(Math.max(index, 0), maxIndex);
}

function OdometerWheel({
  onSettled,
  selectedIndex,
  unitLabel,
  values,
}: OdometerWheelProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(selectedIndex * ODOMETER_WHEEL_ITEM_HEIGHT);
  const maxIndex = values.length - 1;
  const onSettledRef = useRef(onSettled);
  const selectedIndexRef = useRef(selectedIndex);
  const lastSettledIndexRef = useRef(selectedIndex);

  onSettledRef.current = onSettled;
  selectedIndexRef.current = selectedIndex;

  const settle = useCallback(
    (offsetY: number) => {
      const index = clampIndex(
        Math.round(offsetY / ODOMETER_WHEEL_ITEM_HEIGHT),
        maxIndex,
      );

      lastSettledIndexRef.current = index;

      if (index !== selectedIndexRef.current) {
        onSettledRef.current(index);
      }
    },
    [maxIndex],
  );

  const settleWithoutMomentum = useCallback(
    (offsetY: number, velocityY: number) => {
      const restingOffset =
        Math.round(offsetY / ODOMETER_WHEEL_ITEM_HEIGHT) *
        ODOMETER_WHEEL_ITEM_HEIGHT;

      if (Math.abs(velocityY) < 0.05 && Math.abs(offsetY - restingOffset) < 1) {
        settle(offsetY);
      }
    },
    [settle],
  );

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: event => {
        scrollY.value = event.contentOffset.y;
      },
      onEndDrag: event => {
        runOnJS(settleWithoutMomentum)(
          event.contentOffset.y,
          event.velocity?.y ?? 0,
        );
      },
      onMomentumEnd: event => {
        runOnJS(settle)(event.contentOffset.y);
      },
    },
    [settle, settleWithoutMomentum],
  );

  useAnimatedReaction(
    () => {
      const index = Math.round(scrollY.value / ODOMETER_WHEEL_ITEM_HEIGHT);
      return Math.min(Math.max(index, 0), maxIndex);
    },
    (currentIndex, previousIndex) => {
      if (previousIndex !== null && currentIndex !== previousIndex) {
        runOnJS(triggerWheelTickHaptic)();
      }
    },
    [maxIndex],
  );

  // 부모가 선택값을 보정(clamp)하면 휠을 해당 위치로 굴려서 맞춘다.
  useEffect(() => {
    if (selectedIndex === lastSettledIndexRef.current) {
      return;
    }

    lastSettledIndexRef.current = selectedIndex;
    scrollRef.current?.scrollTo({
      animated: true,
      y: selectedIndex * ODOMETER_WHEEL_ITEM_HEIGHT,
    });
  }, [scrollRef, selectedIndex]);

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        contentOffset={{x: 0, y: selectedIndex * ODOMETER_WHEEL_ITEM_HEIGHT}}
        decelerationRate="fast"
        onScroll={scrollHandler}
        overScrollMode="never"
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ODOMETER_WHEEL_ITEM_HEIGHT}>
        {values.map((value, index) => (
          <OdometerWheelRow
            index={index}
            key={`${index}-${value}`}
            label={value}
            scrollY={scrollY}
            withUnitSpace={Boolean(unitLabel)}
          />
        ))}
      </Animated.ScrollView>
      {unitLabel ? (
        <View pointerEvents="none" style={styles.unitWrap}>
          <Text style={styles.unitText}>{unitLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function OdometerWheelRow({
  index,
  label,
  scrollY,
  withUnitSpace,
}: {
  index: number;
  label: string;
  scrollY: SharedScrollValue;
  withUnitSpace: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = interpolate(
      index * ODOMETER_WHEEL_ITEM_HEIGHT - scrollY.value,
      [
        -EDGE_DISTANCE * ODOMETER_WHEEL_ITEM_HEIGHT,
        0,
        EDGE_DISTANCE * ODOMETER_WHEEL_ITEM_HEIGHT,
      ],
      [-EDGE_DISTANCE, 0, EDGE_DISTANCE],
      Extrapolation.CLAMP,
    );
    const magnitude = Math.abs(distance);

    return {
      opacity: interpolate(
        magnitude,
        [0, 1, EDGE_DISTANCE],
        [1, 0.46, 0.05],
        Extrapolation.CLAMP,
      ),
      transform: [
        {perspective: 540},
        {
          translateY: interpolate(
            distance,
            [-EDGE_DISTANCE, 0, EDGE_DISTANCE],
            [ODOMETER_WHEEL_ITEM_HEIGHT * 0.34, 0, -ODOMETER_WHEEL_ITEM_HEIGHT * 0.34],
          ),
        },
        {rotateX: `${distance * 24}deg`},
        {
          scale: interpolate(
            magnitude,
            [0, EDGE_DISTANCE],
            [1, 0.8],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const distance =
      (index * ODOMETER_WHEEL_ITEM_HEIGHT - scrollY.value) /
      ODOMETER_WHEEL_ITEM_HEIGHT;

    return {
      color: interpolateColor(
        Math.min(Math.abs(distance), 1),
        [0, 1],
        ['#111111', '#9aa0aa'],
      ),
    };
  });

  return (
    <Animated.View
      style={[styles.row, withUnitSpace && styles.rowWithUnit, animatedStyle]}>
      <Animated.Text style={[styles.rowText, animatedTextStyle]}>
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    height: ODOMETER_WHEEL_ITEM_HEIGHT * ODOMETER_WHEEL_VISIBLE_ITEMS,
  },
  content: {
    paddingVertical:
      Math.floor(ODOMETER_WHEEL_VISIBLE_ITEMS / 2) * ODOMETER_WHEEL_ITEM_HEIGHT,
  },
  row: {
    alignItems: 'center',
    height: ODOMETER_WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
  },
  rowWithUnit: {
    alignItems: 'flex-end',
    paddingRight: UNIT_LABEL_SPACE + 8,
  },
  rowText: {
    fontSize: 27,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  unitWrap: {
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: UNIT_LABEL_SPACE,
  },
  unitText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default OdometerWheel;

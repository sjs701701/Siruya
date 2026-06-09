import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';

type WaterSupplyGaugeProps = {
  backgroundColor: string;
  progress: number;
  value: string;
};

const GAUGE_SIZE = 112;
const STROKE_WIDTH = 11;
const CENTER = GAUGE_SIZE / 2;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function WaterSupplyGauge({
  backgroundColor,
  progress,
  value,
}: WaterSupplyGaugeProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <View style={[styles.container, {backgroundColor}]}>
      <Svg
        height={GAUGE_SIZE}
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        width={GAUGE_SIZE}>
        <Defs>
          <LinearGradient
            id="waterSupplyGaugeGradient"
            x1="24"
            x2="92"
            y1="18"
            y2="92">
            <Stop offset="0" stopColor="#58f0df" />
            <Stop offset="0.52" stopColor="#22c8f4" />
            <Stop offset="1" stopColor="#1685ef" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke="#eef2f4"
          strokeWidth={STROKE_WIDTH}
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke="url(#waterSupplyGaugeGradient)"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </Svg>
      <Text adjustsFontSizeToFit numberOfLines={2} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: GAUGE_SIZE / 2,
    height: GAUGE_SIZE,
    justifyContent: 'center',
    shadowColor: '#b7c3ca',
    shadowOffset: {height: 12, width: 0},
    shadowOpacity: 0.2,
    shadowRadius: 18,
    width: GAUGE_SIZE,
  },
  value: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    maxWidth: 66,
    textAlign: 'center',
  },
});

export default WaterSupplyGauge;

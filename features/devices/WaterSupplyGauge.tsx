import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';

type WaterSupplyGaugeProps = {
  backgroundColor: string;
  progress: number;
  value: string;
};

const GAUGE_SIZE = 112;
const STROKE_WIDTH = 11;
const CENTER = GAUGE_SIZE / 2;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const GAUGE_SEGMENTS = 120;
const TRACK_COLOR = '#eef2f4';
const START_COLOR = '#b4ffee';
const END_COLOR = '#007ce2';
const CAP_PROGRESS_OFFSET = (STROKE_WIDTH / 2) / (2 * Math.PI * RADIUS);
const SOFT_EDGE_PROGRESS = 0.055;
const SOFT_EDGE_SEGMENTS = 8;
const SOFT_EDGE_MAX_OPACITY = 1;

function WaterSupplyGauge({
  backgroundColor,
  progress,
  value,
}: WaterSupplyGaugeProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const progressSegments = React.useMemo(
    () => createProgressSegments(getCappedArcProgress(clampedProgress)),
    [clampedProgress],
  );
  const softEdgeSegments = React.useMemo(
    () => createSoftEdgeSegments(clampedProgress),
    [clampedProgress],
  );
  const endCap = React.useMemo(
    () =>
      clampedProgress > CAP_PROGRESS_OFFSET
        ? getPointOnCircle(
            CENTER,
            CENTER,
            RADIUS,
            getCappedArcProgress(clampedProgress),
          )
        : null,
    [clampedProgress],
  );
  return (
    <View style={[styles.container, {backgroundColor}]}>
      <Svg
        height={GAUGE_SIZE}
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        width={GAUGE_SIZE}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke={TRACK_COLOR}
          strokeWidth={STROKE_WIDTH}
        />
        {progressSegments.map(segment => (
          <Path
            d={segment.path}
            fill="none"
            key={segment.key}
            stroke={segment.color}
            strokeLinecap="butt"
            strokeWidth={STROKE_WIDTH}
          />
        ))}
        {softEdgeSegments.map(segment => (
          <Path
            d={segment.path}
            fill="none"
            key={segment.key}
            stroke={TRACK_COLOR}
            strokeLinecap="butt"
            strokeOpacity={segment.opacity}
            strokeWidth={STROKE_WIDTH}
          />
        ))}
        {endCap && (
          <Circle
            cx={CENTER}
            cy={CENTER - RADIUS}
            fill={START_COLOR}
            r={STROKE_WIDTH / 2}
          />
        )}
      </Svg>
      <Text adjustsFontSizeToFit numberOfLines={2} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

function getCappedArcProgress(progress: number) {
  return Math.max(progress - CAP_PROGRESS_OFFSET, 0);
}

function createProgressSegments(progress: number) {
  const segmentCount = Math.ceil(progress * GAUGE_SEGMENTS);

  return Array.from({length: segmentCount}, (_, index) => {
    const startProgress = index / GAUGE_SEGMENTS;
    const endProgress = Math.min((index + 1) / GAUGE_SEGMENTS, progress);

    return {
      color: interpolateColor(endProgress),
      key: `${index}-${endProgress}`,
      path: createArcPath(startProgress, endProgress),
    };
  }).filter(segment => segment.path.length > 0);
}

function createSoftEdgeSegments(progress: number) {
  const cappedProgress = getCappedArcProgress(progress);

  if (cappedProgress <= 0) {
    return [];
  }

  const startProgress = Math.max(cappedProgress - SOFT_EDGE_PROGRESS, 0);
  const edgeLength = cappedProgress - startProgress;

  if (edgeLength <= 0) {
    return [];
  }

  return Array.from({length: SOFT_EDGE_SEGMENTS}, (_, index) => {
    const startRatio = index / SOFT_EDGE_SEGMENTS;
    const endRatio = (index + 1) / SOFT_EDGE_SEGMENTS;
    const segmentStart = startProgress + edgeLength * startRatio;
    const segmentEnd = startProgress + edgeLength * endRatio;

    return {
      key: `soft-${index}-${segmentEnd}`,
      opacity: SOFT_EDGE_MAX_OPACITY * endRatio,
      path: createArcPath(segmentStart, segmentEnd),
    };
  }).filter(segment => segment.path.length > 0);
}

function createArcPath(startProgress: number, endProgress: number) {
  if (endProgress <= startProgress) {
    return '';
  }

  const start = getPointOnCircle(CENTER, CENTER, RADIUS, startProgress);
  const end = getPointOnCircle(CENTER, CENTER, RADIUS, endProgress);
  const largeArcFlag = endProgress - startProgress > 0.5 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function getPointOnCircle(
  centerX: number,
  centerY: number,
  radius: number,
  progress: number,
) {
  const angle = -90 + progress * 360;
  const angleInRadians = (angle * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function interpolateColor(progress: number) {
  const start = hexToRgb(START_COLOR);
  const end = hexToRgb(END_COLOR);
  const red = Math.round(start.red + (end.red - start.red) * progress);
  const green = Math.round(start.green + (end.green - start.green) * progress);
  const blue = Math.round(start.blue + (end.blue - start.blue) * progress);

  return `rgb(${red}, ${green}, ${blue})`;
}

function hexToRgb(hex: string) {
  return {
    red: parseInt(hex.slice(1, 3), 16),
    green: parseInt(hex.slice(3, 5), 16),
    blue: parseInt(hex.slice(5, 7), 16),
  };
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
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 66,
    textAlign: 'center',
  },
});

export default WaterSupplyGauge;

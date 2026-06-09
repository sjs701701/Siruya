import React, {useEffect, useRef, useState, type RefObject} from 'react';
import {StyleSheet, type StyleProp, View, type ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';

type AirFlowEffectProps = {
  active: boolean;
  style?: StyleProp<ViewStyle>;
};

type AirFlowPath = {
  d: string;
  id: number;
  opacity: number;
  strokeWidth: number;
};

type EffectSize = {
  height: number;
  width: number;
};

const LINE_COUNT = 10;
const FRAME_INTERVAL_MS = 32;

function AirFlowEffect({active, style}: AirFlowEffectProps) {
  const [size, setSize] = useState<EffectSize>({height: 0, width: 0});
  const [paths, setPaths] = useState<AirFlowPath[]>([]);
  const phaseRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) {
      return undefined;
    }

    if (!active) {
      phaseRef.current = 0;
      setPaths(createAirFlowPaths(size, phaseRef.current, active));
      return () => cancelCurrentFrame(frameRef);
    }

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameAtRef.current >= FRAME_INTERVAL_MS) {
        lastFrameAtRef.current = timestamp;
        phaseRef.current += 0.09;
        setPaths(createAirFlowPaths(size, phaseRef.current, active));
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelCurrentFrame(frameRef);
  }, [active, size]);

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
      onLayout={event => {
        const {height, width} = event.nativeEvent.layout;
        setSize({height, width});
      }}>
      {size.width > 0 && size.height > 0 && (
        <Svg
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          width={size.width}>
          <Defs>
            <LinearGradient id="airFlowGlow" x1="0%" x2="100%" y1="0%" y2="0%">
              <Stop offset="0%" stopColor="#05070b" stopOpacity="0" />
              <Stop offset="14%" stopColor="#6ea9ff" stopOpacity="0.1" />
              <Stop offset="36%" stopColor="#86bbff" stopOpacity="0.48" />
              <Stop offset="50%" stopColor="#f8fbff" stopOpacity="1" />
              <Stop offset="64%" stopColor="#86bbff" stopOpacity="0.48" />
              <Stop offset="86%" stopColor="#6ea9ff" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#05070b" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {paths.map(path => (
            <Path
              key={path.id}
              d={path.d}
              fill="none"
              opacity={path.opacity}
              stroke="url(#airFlowGlow)"
              strokeLinecap="round"
              strokeWidth={path.strokeWidth}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

function createAirFlowPaths(
  {height, width}: EffectSize,
  phase: number,
  active: boolean,
) {
  const amplitude = active ? 8 : 0;
  const step = Math.max(5, width / 28);
  const centerY = height * 0.56;

  return Array.from({length: LINE_COUNT}, (_, index) => {
    const frequency = 1 + index * 0.15;
    const amplitudeModifier = 1 - index * (0.4 / LINE_COUNT);
    const offset = index * ((Math.PI * 2) / LINE_COUNT);
    const speedModifier = index % 2 === 0 ? 1 : 1.2;
    const lineSpread = (index - (LINE_COUNT - 1) / 2) * (height * 0.012);
    let d = `M 0 ${centerY}`;

    for (let x = 0; x <= width + step; x += step) {
      const normalizedX = Math.min(x / width, 1);
      const envelope = Math.sin(normalizedX * Math.PI);
      const primaryWave =
        Math.sin(
          normalizedX * Math.PI * 2 * frequency +
            phase * speedModifier +
            offset,
        ) *
        amplitude *
        amplitudeModifier;
      const secondaryWave =
        Math.cos(normalizedX * Math.PI * 4 - phase * 0.8 + offset) *
        (amplitude * 0.2);
      const y = centerY + (lineSpread + primaryWave + secondaryWave) * envelope;
      d += ` L ${x} ${y}`;
    }

    return {
      d,
      id: index,
      opacity: active
        ? 0.26 + (index / LINE_COUNT) * 0.56
        : 0.14 + (index / LINE_COUNT) * 0.28,
      strokeWidth: 0.7 + (LINE_COUNT - index) * 0.13,
    };
  });
}

function cancelCurrentFrame(frameRef: RefObject<number | null>) {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current);
  }
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export default AirFlowEffect;

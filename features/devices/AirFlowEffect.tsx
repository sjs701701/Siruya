import React, {useState} from 'react';
import {StyleSheet, type StyleProp, View, type ViewStyle} from 'react-native';
import {
  Canvas,
  LinearGradient,
  Path,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import {useDerivedValue} from 'react-native-reanimated';

type AirFlowEffectProps = {
  active: boolean;
  style?: StyleProp<ViewStyle>;
};

type EffectSize = {
  height: number;
  width: number;
};

const LINE_COUNT = 10;
const AIR_FLOW_PHASE_PER_MS = 0.0028;

function AirFlowEffect({active, style}: AirFlowEffectProps) {
  const [size, setSize] = useState<EffectSize>({height: 0, width: 0});
  const clock = useClock();

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
      onLayout={event => {
        const {height, width} = event.nativeEvent.layout;
        setSize(current =>
          current.height === height && current.width === width
            ? current
            : {height, width},
        );
      }}>
      {size.width > 0 && size.height > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          {Array.from({length: LINE_COUNT}, (_, index) => (
            <AirFlowLine
              active={active}
              clock={clock}
              index={index}
              key={index}
              size={size}
            />
          ))}
        </Canvas>
      )}
    </View>
  );
}

function AirFlowLine({
  active,
  clock,
  index,
  size,
}: {
  active: boolean;
  clock: {value: number};
  index: number;
  size: EffectSize;
}) {
  const path = useDerivedValue(() => {
    const phase = active ? clock.value * AIR_FLOW_PHASE_PER_MS : 0;
    return createAirFlowPath(size, phase, index, active);
  }, [active, clock, index, size.height, size.width]);
  const opacity = active
    ? 0.26 + (index / LINE_COUNT) * 0.56
    : 0.14 + (index / LINE_COUNT) * 0.28;
  const strokeWidth = 0.7 + (LINE_COUNT - index) * 0.13;

  return (
    <Path
      opacity={opacity}
      path={path}
      strokeCap="round"
      strokeWidth={strokeWidth}
      style="stroke">
      <LinearGradient
        colors={[
          'rgba(5,7,11,0)',
          'rgba(110,169,255,0.1)',
          'rgba(134,187,255,0.48)',
          'rgba(248,251,255,1)',
          'rgba(134,187,255,0.48)',
          'rgba(110,169,255,0.1)',
          'rgba(5,7,11,0)',
        ]}
        end={vec(size.width, 0)}
        positions={[0, 0.14, 0.36, 0.5, 0.64, 0.86, 1]}
        start={vec(0, 0)}
      />
    </Path>
  );
}

function createAirFlowPath(
  {height, width}: EffectSize,
  phase: number,
  index: number,
  active: boolean,
) {
  'worklet';

  const amplitude = active ? 8 : 0;
  const step = Math.max(5, width / 28);
  const centerY = height * 0.56;
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

  return d;
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export default AirFlowEffect;

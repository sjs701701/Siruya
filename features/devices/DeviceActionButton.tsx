import React, {type ComponentProps, type ReactNode} from 'react';
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import HapticPressable from './HapticPressable';

type DeviceActionButtonProps = Omit<
  ComponentProps<typeof HapticPressable>,
  'children' | 'style'
> & {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  tone?: 'light' | 'dark';
  useBackdropBlur?: boolean;
};

function DeviceActionButton({
  children,
  contentStyle,
  style,
  tone = 'light',
  useBackdropBlur = true,
  accessibilityRole,
  disabled,
  ...props
}: DeviceActionButtonProps) {
  const isDark = tone === 'dark';

  return (
    <HapticPressable
      {...props}
      accessibilityRole={accessibilityRole ?? 'button'}
      disabled={disabled}
      style={[styles.pressable, style, disabled && styles.pressableDisabled]}>
      {({pressed}) => (
        <View
          style={[
            styles.button,
            isDark ? styles.buttonDark : styles.buttonLight,
            disabled && (isDark ? styles.buttonDarkDisabled : styles.buttonLightDisabled),
            pressed && !disabled && styles.buttonPressed,
            pressed && !disabled && (isDark ? styles.buttonDarkPressed : styles.buttonLightPressed),
          ]}>
          {/* Clipped glass stack: real backdrop blur → translucent tint */}
          <View style={styles.glassClip}>
            {useBackdropBlur ? (
              <BlurView
                style={StyleSheet.absoluteFill}
                blurType={isDark ? 'dark' : 'light'}
                blurAmount={isDark ? 14 : 18}
                overlayColor="transparent"
                reducedTransparencyFallbackColor={isDark ? '#1b1b1e' : '#f3f3f3'}
              />
            ) : (
              <View
                style={[
                  styles.blurFallback,
                  isDark ? styles.blurFallbackDark : styles.blurFallbackLight,
                ]}
              />
            )}
            <View
              style={[
                styles.tint,
                isDark ? styles.tintDark : styles.tintLight,
                disabled && (isDark ? styles.tintDarkDisabled : styles.tintLightDisabled),
                pressed && !disabled &&
                  (isDark ? styles.tintDarkPressed : styles.tintLightPressed),
              ]}
            />
          </View>
          <View style={[styles.content, contentStyle]}>
            {/* Inject a press-reactive text shadow: a gap below the glyphs at
                rest that pulls in tight (overlaps) while pressed. */}
            {React.Children.map(children, child => {
              if (!React.isValidElement(child)) {
                return child;
              }
              const el = child as React.ReactElement<{
                style?: StyleProp<TextStyle>;
              }>;
              return React.cloneElement(el, {
                style: [
                  el.props.style,
                  pressed ? styles.textPressed : styles.textRaised,
                ],
              });
            })}
          </View>
        </View>
      )}
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    backgroundColor: 'transparent',
    borderRadius: 999,
  },
  pressableDisabled: {
    opacity: 0.6,
    filter: [{grayscale: 0.5}],
  },
  // Outer frame: pill shape, glass rim border, drop shadow. Transparent so the
  // blur shows through. overflow visible so the drop shadow is not clipped.
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    isolation: 'isolate',
    justifyContent: 'center',
    minHeight: 52,
    overflow: 'visible',
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: '100%',
  },
  // Rest = floating: a tight contact shadow plus a soft shadow cast well below.
  buttonLight: {
    borderColor: 'rgba(255,255,255,0.5)',
    boxShadow: [
      {offsetX: 0, offsetY: 4, blurRadius: 2, spreadDistance: -2, color: 'rgba(0,0,0,0.2)'},
    ],
  },
  buttonLightDisabled: {
    borderColor: 'rgba(255,255,255,0.3)',
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 2, spreadDistance: -2, color: 'rgba(0,0,0,0.15)'},
    ],
  },
  buttonDark: {
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 4, spreadDistance: -1, color: 'rgba(0,0,0,0.25)'},
    ],
  },
  buttonDarkDisabled: {
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 3, spreadDistance: -2, color: 'rgba(0,0,0,0.24)'},
    ],
  },
  // Press = settle onto the floor: drop down + slight tilt + scale.
  buttonPressed: {
    transform: [{perspective: 700}, {rotateX: '25deg'}, {scale: 0.975}],
  },
  // ...and the shadow collapses to a tight contact shadow with a lit bottom edge.
  buttonLightPressed: {
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 2, spreadDistance: -2, color: 'rgba(0,0,0,0.2)'},
      {offsetX: 0, offsetY: 3.6, blurRadius: 0.8, spreadDistance: 0, color: 'rgba(0,0,0,0.05)'},
      {offsetX: 0, offsetY: 4, blurRadius: 0, spreadDistance: 0, color: 'rgba(255,255,255,0.75)'},
    ],
  },
  buttonDarkPressed: {
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 3, spreadDistance: -2, color: 'rgba(0,0,0,0.45)'},
      {offsetX: 0, offsetY: 3, blurRadius: 0, spreadDistance: 0, color: 'rgba(255,255,255,0.25)'},
    ],
  },
  // Rounded clip that holds the blur + tint + glare layers.
  glassClip: {
    borderRadius: 999,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  blurFallback: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  blurFallbackLight: {
    backgroundColor: '#f1f1f1',
  },
  blurFallbackDark: {
    backgroundColor: '#2f2f32',
  },
  // Translucent frost on top of the blur, with inset rim highlights.
  tint: {
    borderRadius: 999,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tintLight: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    experimental_backgroundImage:
      'linear-gradient(285deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 2, inset: true, color: 'rgba(0,0,0,0.05)'},
      {offsetX: 0, offsetY: -2, blurRadius: 2, inset: true, color: 'rgba(255,255,255,0.5)'},
      {offsetX: 0, offsetY: 0, blurRadius: 1.6, spreadDistance: 4, inset: true, color: 'rgba(255,255,255,0.2)'},
    ],
  },
  tintLightDisabled: {
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 2, inset: true, color: 'rgba(0,0,0,0.05)'},
      {offsetX: 0, offsetY: -2, blurRadius: 2, inset: true, color: 'rgba(255,255,255,0.3)'},
    ],
  },
  tintDark: {
    backgroundColor: 'rgba(26,26,29,0.45)',
    experimental_backgroundImage:
      'linear-gradient(285deg, rgba(255,255,255,0.04), rgba(255,255,255,0.22), rgba(255,255,255,0.04))',
    boxShadow: [
      {offsetX: 0, offsetY: 1, blurRadius: 1, inset: true, color: 'rgba(255,255,255,0.28)'},
      {offsetX: 0, offsetY: -2, blurRadius: 3, inset: true, color: 'rgba(0,0,0,0.4)'},
      {offsetX: 0, offsetY: 0, blurRadius: 1.6, spreadDistance: 3, inset: true, color: 'rgba(255,255,255,0.06)'},
    ],
  },
  tintDarkDisabled: {
    boxShadow: [
      {offsetX: 0, offsetY: 1, blurRadius: 1, inset: true, color: 'rgba(255,255,255,0.14)'},
      {offsetX: 0, offsetY: -2, blurRadius: 3, inset: true, color: 'rgba(0,0,0,0.32)'},
    ],
  },
  tintLightPressed: {
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 2, inset: true, color: 'rgba(0,0,0,0.05)'},
      {offsetX: 0, offsetY: -2, blurRadius: 2, inset: true, color: 'rgba(255,255,255,0.5)'},
      {offsetX: 0, offsetY: 0, blurRadius: 1.6, spreadDistance: 4, inset: true, color: 'rgba(255,255,255,0.2)'},
      {offsetX: 0, offsetY: 4, blurRadius: 0.8, inset: true, color: 'rgba(0,0,0,0.15)'},
    ],
  },
  tintDarkPressed: {
    boxShadow: [
      {offsetX: 0, offsetY: 1, blurRadius: 1, inset: true, color: 'rgba(255,255,255,0.2)'},
      {offsetX: 0, offsetY: 3, blurRadius: 4, inset: true, color: 'rgba(0,0,0,0.5)'},
      {offsetX: 0, offsetY: 0, blurRadius: 1.6, spreadDistance: 3, inset: true, color: 'rgba(255,255,255,0.05)'},
    ],
  },
  // Diagonal sheen (reference span::after) — disabled
  /*
  glare: {
    borderRadius: 999,
    bottom: 0,
    left: 0,
    mixBlendMode: 'screen',
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  glareLight: {
    experimental_backgroundImage:
      'linear-gradient(315deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 55%)',
  },
  glareDark: {
    experimental_backgroundImage:
      'linear-gradient(315deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 40%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 55%)',
  },
  */
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  contentDisabled: {
    opacity: 0.6,
  },
  // Raised text: shadow sits a few px below the glyphs (visible gap = lifted).
  textRaised: {
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: {height: 4, width: 0},
    textShadowRadius: 0.8,
  },
  // Pressed text: shadow pulls in tight under the glyphs (gap closes/overlaps).
  textPressed: {
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: {height: 4, width: 0.4},
    textShadowRadius: 0.8,
  },
});

export default DeviceActionButton;

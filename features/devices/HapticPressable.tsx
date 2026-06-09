import React, {useCallback} from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import {
  type HapticEvent,
  HapticFeedbackTypes,
  trigger,
  triggerPattern,
  type HapticOptions,
} from 'react-native-haptic-feedback';

type HapticPressableProps = PressableProps & {
  hapticOptions?: HapticOptions;
  hapticType?: HapticFeedbackTypes | keyof typeof HapticFeedbackTypes;
};

const defaultHapticOptions: HapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: true,
};

const androidButtonPattern: HapticEvent[] = [
  {
    duration: 36,
    intensity: 1,
    sharpness: 1,
    time: 0,
  },
  {
    duration: 22,
    intensity: 0.7,
    sharpness: 0.9,
    time: 54,
  },
];

function vibrateAndroidButton() {
  triggerPattern(androidButtonPattern, defaultHapticOptions);
}

export function triggerToggleHaptic(nextValue: boolean) {
  if (Platform.OS === 'android') {
    vibrateAndroidButton();
    return;
  }

  trigger(
    nextValue ? HapticFeedbackTypes.toggleOn : HapticFeedbackTypes.toggleOff,
    defaultHapticOptions,
  );
}

function HapticPressable({
  disabled,
  hapticOptions,
  hapticType = HapticFeedbackTypes.effectClick,
  onLongPress,
  onPress,
  onPressIn,
  ...props
}: HapticPressableProps) {
  const fireHaptic = useCallback(() => {
    const hasInteractiveHandler = Boolean(onPress || onPressIn || onLongPress);

    if (disabled || !hasInteractiveHandler) {
      return;
    }

    if (Platform.OS === 'android') {
      vibrateAndroidButton();
      return;
    }

    trigger(hapticType, {
      ...defaultHapticOptions,
      ...hapticOptions,
    });
  }, [disabled, hapticOptions, hapticType, onLongPress, onPress, onPressIn]);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
    },
    [onPressIn],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      fireHaptic();
      onPress?.(event);
    },
    [fireHaptic, onPress],
  );

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      onLongPress?.(event);
    },
    [onLongPress],
  );

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onLongPress={handleLongPress}
      onPress={handlePress}
      onPressIn={handlePressIn}
    />
  );
}

export default HapticPressable;

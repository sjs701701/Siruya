import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';

const pretendardFamily = Platform.select({
  android: 'pretendard',
  default: 'Pretendard',
  ios: 'Pretendard',
});

type DefaultTextPropsTarget = {
  defaultProps?: {
    style?: StyleProp<TextStyle>;
  };
};

const styles = StyleSheet.create({
  defaultText: {
    fontFamily: pretendardFamily,
  },
});

function applyDefaultTextStyle(target: DefaultTextPropsTarget) {
  const currentDefaultProps = target.defaultProps ?? {};
  target.defaultProps = {
    ...currentDefaultProps,
    style: [styles.defaultText, currentDefaultProps.style],
  };
}

export function configureAppTypography() {
  applyDefaultTextStyle(Text as unknown as DefaultTextPropsTarget);
  applyDefaultTextStyle(TextInput as unknown as DefaultTextPropsTarget);
}

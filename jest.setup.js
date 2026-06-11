/* eslint-env jest */

jest.mock('react-native-haptic-feedback', () => ({
  HapticFeedbackTypes: {
    effectClick: 'effectClick',
    effectTick: 'effectTick',
    selection: 'selection',
    toggleOff: 'toggleOff',
    toggleOn: 'toggleOn',
  },
  trigger: jest.fn(),
  triggerPattern: jest.fn(),
}));

jest.mock('react-native-video', () => {
  const React = require('react');
  const {View} = require('react-native');

  function Video(props) {
    return React.createElement(View, props);
  }

  return {
    __esModule: true,
    default: Video,
    ResizeMode: {
      CONTAIN: 'contain',
      COVER: 'cover',
      STRETCH: 'stretch',
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const {ScrollView, Text, View} = require('react-native');

  return {
    __esModule: true,
    default: {
      ScrollView,
      Text,
      View,
      createAnimatedComponent: component => component,
    },
    Extrapolation: {CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity'},
    interpolate: (_value, _input, output) => output[0],
    interpolateColor: (_value, _input, output) => output[0],
    runOnJS: fn => fn,
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => ({current: null}),
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedStyle: () => ({}),
    useDerivedValue: factory => ({value: factory()}),
    useSharedValue: initialValue => ({value: initialValue}),
  };
});

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({children, style}) => {
    const React = require('react');
    const {View} = require('react-native');
    return React.createElement(View, {style}, children);
  },
  LinearGradient: () => null,
  Path: ({children}) => {
    const React = require('react');
    return React.createElement(React.Fragment, null, children);
  },
  useClock: () => ({value: 0}),
  vec: (x, y) => ({x, y}),
}));

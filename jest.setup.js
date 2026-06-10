/* eslint-env jest */

jest.mock('react-native-haptic-feedback', () => ({
  HapticFeedbackTypes: {
    effectClick: 'effectClick',
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

jest.mock('react-native-reanimated', () => ({
  useDerivedValue: factory => ({value: factory()}),
}));

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

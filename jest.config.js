module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-community|react-native-haptic-feedback|react-native-reanimated|react-native-worklets|react-native-svg|react-native-video|@shopify/react-native-skia)/)',
  ],
};

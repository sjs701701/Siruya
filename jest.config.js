module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.secret-scan-plantapp-net/',
    '/dist/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-community|react-native-haptic-feedback|react-native-reanimated|react-native-worklets|react-native-svg|react-native-video|@shopify/react-native-skia)/)',
  ],
};

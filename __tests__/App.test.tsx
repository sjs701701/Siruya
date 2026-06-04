/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-wifi-reborn', () => ({
  __esModule: true,
  default: {
    connectToProtectedSSID: jest.fn(),
    connectToSSID: jest.fn(),
    disconnect: jest.fn(),
    getCurrentWifiSSID: jest.fn(),
    loadWifiList: jest.fn(),
  },
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

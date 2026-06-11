import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {configureAppTypography} from './features/devices/appTypography';
import MainTab from './screens/MainTab';

configureAppTypography();

function App() {
  return (
    <SafeAreaProvider>
      <MainTab />
    </SafeAreaProvider>
  );
}

export default App;

import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import MainTab from './screens/MainTab';

function App() {
  return (
    <SafeAreaProvider>
      <MainTab />
    </SafeAreaProvider>
  );
}

export default App;

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ScanScreen from './src/screens/ScanScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import CompareScreen from './src/screens/CompareScreen';
import AccountScreen from './src/screens/AccountScreen';
import DetectPreviewScreen from './src/screens/DetectPreviewScreen';
import TfliteReproScreen from './src/screens/TfliteReproScreen';
import { AppProvider } from './src/context/AppContext';

const Tab = createBottomTabNavigator();
const ScanStack = createNativeStackNavigator();
const CompareStack = createNativeStackNavigator();
const AccountStack = createNativeStackNavigator();

function ScanStackNavigator() {
  return (
    <ScanStack.Navigator>
      <ScanStack.Screen name="ScanScreen" component={ScanScreen} options={{ title: 'Scan' }} />
      <ScanStack.Screen name="DetectPreview" component={DetectPreviewScreen} options={{ title: 'Detect' }} />
      <ScanStack.Screen name="ResultsScreen" component={ResultsScreen} options={{ title: 'Results' }} />
    </ScanStack.Navigator>
  );
}

function CompareStackNavigator() {
  return (
    <CompareStack.Navigator>
      <CompareStack.Screen name="HistoryScreen" component={HistoryScreen} options={{ title: 'History' }} />
      <CompareStack.Screen name="CompareScreen" component={CompareScreen} options={{ title: 'Compare' }} />
      <CompareStack.Screen name="ResultsScreen" component={ResultsScreen} options={{ title: 'Results' }} />
    </CompareStack.Navigator>
  );
}

function AccountStackNavigator() {
  return (
    <AccountStack.Navigator>
      <AccountStack.Screen name="AccountScreen" component={AccountScreen} options={{ title: 'Account' }} />
      <AccountStack.Screen name="TfliteRepro" component={TfliteReproScreen} options={{ title: 'TFLite Repro' }} />
    </AccountStack.Navigator>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer theme={DefaultTheme}>
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen name="Scan" component={ScanStackNavigator} />
          <Tab.Screen name="Compare" component={CompareStackNavigator} />
          <Tab.Screen name="Account" component={AccountStackNavigator} />
        </Tab.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}

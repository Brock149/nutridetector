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

const BRAND_SLATE = '#0b1917';
const PANEL_SLATE = '#102624';
const BRAND_MINT = '#2cd0b1';
const TEXT_PRIMARY = '#f6fffb';
const TEXT_MUTED = 'rgba(246,255,251,0.6)';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: BRAND_SLATE,
    card: PANEL_SLATE,
    text: TEXT_PRIMARY,
    border: 'rgba(255,255,255,0.08)',
    primary: BRAND_MINT,
  },
};

const stackScreenOptions = {
  headerStyle: { backgroundColor: PANEL_SLATE },
  headerTintColor: TEXT_PRIMARY,
  headerTitleStyle: { fontWeight: '700' as const, letterSpacing: 0.2 },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
};

function ScanStackNavigator() {
  return (
    <ScanStack.Navigator screenOptions={stackScreenOptions}>
      <ScanStack.Screen name="ScanScreen" component={ScanScreen} options={{ title: 'Scan' }} />
      <ScanStack.Screen name="DetectPreview" component={DetectPreviewScreen} options={{ title: 'Detect' }} />
      <ScanStack.Screen name="ResultsScreen" component={ResultsScreen} options={{ title: 'Results' }} />
    </ScanStack.Navigator>
  );
}

function CompareStackNavigator() {
  return (
    <CompareStack.Navigator screenOptions={stackScreenOptions}>
      <CompareStack.Screen name="HistoryScreen" component={HistoryScreen} options={{ title: 'History' }} />
      <CompareStack.Screen name="CompareScreen" component={CompareScreen} options={{ title: 'Compare' }} />
      <CompareStack.Screen name="ResultsScreen" component={ResultsScreen} options={{ title: 'Results' }} />
    </CompareStack.Navigator>
  );
}

function AccountStackNavigator() {
  return (
    <AccountStack.Navigator screenOptions={stackScreenOptions}>
      <AccountStack.Screen name="AccountScreen" component={AccountScreen} options={{ title: 'Account' }} />
      <AccountStack.Screen name="TfliteRepro" component={TfliteReproScreen} options={{ title: 'TFLite Repro' }} />
    </AccountStack.Navigator>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: PANEL_SLATE,
              borderTopColor: 'rgba(255,255,255,0.08)',
              paddingVertical: 6,
              height: 64,
            },
            tabBarActiveTintColor: BRAND_MINT,
            tabBarInactiveTintColor: TEXT_MUTED,
            tabBarLabelStyle: { fontWeight: '600', fontSize: 12 },
            tabBarIconStyle: { display: 'none' },
          }}
        >
          <Tab.Screen name="Scan" component={ScanStackNavigator} />
          <Tab.Screen name="Compare" component={CompareStackNavigator} />
          <Tab.Screen name="Account" component={AccountStackNavigator} />
        </Tab.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}

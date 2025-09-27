import React from 'react';
import { View, Text, Button } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNavigation } from '@react-navigation/native';

export default function AccountScreen() {
  const { tokens, subscriptionStatus, earnTokens } = useApp();
  const navigation = useNavigation<any>();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 16 }}>Account</Text>

      <Text style={{ marginBottom: 8 }}>Token balance: {tokens}</Text>
      <Text style={{ marginBottom: 16 }}>Subscription: {subscriptionStatus}</Text>

      {__DEV__ && (
        <View style={{ gap: 8 }}>
          <Button title="Add +5 Test Tokens" onPress={() => earnTokens(5)} />
          <Button title="Open TFLite Repro" onPress={() => navigation.navigate('TfliteRepro')} />
        </View>
      )}
    </View>
  );
}



import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Button, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
};

type HistoryRouteParams = {
  initialSelected?: string[];
  autoSelectSecond?: boolean;
};

type HistoryRoute = RouteProp<Record<string, HistoryRouteParams>, string>;

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<HistoryRoute>();
  const { history } = useApp();

  const sortedHistory = useMemo(() => history.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [history]);

  const [selected, setSelected] = useState<string[]>(route.params?.initialSelected ?? []);

  useEffect(() => {
    if (route.params?.autoSelectSecond && selected.length === 1 && sortedHistory.length > 1) {
      const fallback = sortedHistory.find((entry) => entry.id !== selected[0]);
      if (fallback) {
        setSelected([selected[0], fallback.id]);
      }
    }
  }, [route.params?.autoSelectSecond, selected, sortedHistory]);

  useEffect(() => {
    if (route.params?.initialSelected) {
      setSelected(route.params.initialSelected.slice(0, 2));
    }
  }, [route.params?.initialSelected]);

  const toggleSelection = useCallback(
    (id: string) => {
      setSelected((prev) => {
        if (prev.includes(id)) {
          return prev.filter((entry) => entry !== id);
        }
        if (prev.length === 0) return [id];
        if (prev.length === 1) return [...prev, id];
        return [prev[0], id];
      });
    },
    []
  );

  const handleCompare = useCallback(() => {
    if (selected.length < 2) {
      Alert.alert('Select two scans', 'Choose two scans to compare.');
      return;
    }
    navigation.navigate('CompareScreen', { scanIds: selected });
  }, [selected, navigation]);

  const renderItem = ({ item }: { item: ScanResult }) => {
    const isSelected = selected.includes(item.id);
    return (
      <TouchableOpacity
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.8}
        style={{
          padding: 16,
          marginHorizontal: 16,
          marginVertical: 8,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: isSelected ? '#007aff' : '#e5e5ea',
          backgroundColor: isSelected ? 'rgba(0,122,255,0.12)' : '#fff',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontWeight: '600' }}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Text>{Number.isFinite(item.price) ? `$${item.price.toFixed(2)}` : '—'}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#8e8e93', fontSize: 12 }}>Calories/$</Text>
            <Text style={{ fontWeight: '500' }}>{formatNumber(item.metrics.caloriesPerDollar)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#8e8e93', fontSize: 12 }}>Protein/$</Text>
            <Text style={{ fontWeight: '500' }}>{formatNumber(item.metrics.proteinPerDollar)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#8e8e93', fontSize: 12 }}>Cost/Meal</Text>
            <Text style={{ fontWeight: '500' }}>{formatNumber(item.metrics.costPerMeal)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {sortedHistory.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: '500', textAlign: 'center' }}>No scans yet</Text>
          <Text style={{ marginTop: 8, color: '#8e8e93', textAlign: 'center' }}>Scan items to see them here and compare later.</Text>
        </View>
      ) : (
        <FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentInset={{ bottom: 120, top: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 16 }}
        />
      )}
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#e5e5ea', backgroundColor: '#fff' }}>
        <Button title="Compare" onPress={handleCompare} disabled={selected.length < 2} />
      </View>
    </View>
  );
}



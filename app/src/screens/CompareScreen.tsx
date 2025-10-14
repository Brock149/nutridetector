import React, { useMemo } from 'react';
import { View, Text, ScrollView, Button } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';

type CompareRouteParams = {
  scanIds: string[];
};

type CompareRoute = RouteProp<Record<string, CompareRouteParams>, string>;

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
};

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
};

const metricRows = [
  { key: 'caloriesPerDollar', label: 'Calories per $', higherIsBetter: true },
  { key: 'proteinPerDollar', label: 'Protein per $', higherIsBetter: true },
  { key: 'caloriesPerProtein', label: 'Calories per gram protein', higherIsBetter: false },
  { key: 'costPerServing', label: 'Cost per serving', higherIsBetter: false },
  { key: 'mealsPerContainer', label: 'Meals per container', higherIsBetter: true },
  { key: 'costPerMeal', label: 'Cost per meal', higherIsBetter: false },
] as const;

type MetricKey = typeof metricRows[number]['key'];

type DecoratedScan = ScanResult & { formattedDate: string };

const decorateScan = (scan: ScanResult): DecoratedScan => ({
  ...scan,
  formattedDate: new Date(scan.createdAt).toLocaleString(),
});

export default function CompareScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<CompareRoute>();
  const { history } = useApp();

  const [left, right] = useMemo(() => {
    const ids = route.params?.scanIds ?? [];
    const matches = ids
      .map((id) => history.find((entry) => entry.id === id))
      .filter((entry): entry is ScanResult => !!entry)
      .slice(0, 2);
    if (matches.length === 2) {
      return [decorateScan(matches[0]), decorateScan(matches[1])];
    }
    if (matches.length === 1) {
      const fallback = history.find((entry) => entry.id !== matches[0].id);
      return [decorateScan(matches[0]), fallback ? decorateScan(fallback) : undefined];
    }
    if (history.length >= 2) {
      return [decorateScan(history[0]), decorateScan(history[1])];
    }
    return [history[0] ? decorateScan(history[0]) : undefined, history[1] ? decorateScan(history[1]) : undefined];
  }, [route.params?.scanIds, history]);

  const handleSwap = () => {
    if (left && right) {
      navigation.setParams({ scanIds: [right.id, left.id] });
    }
  };

  const handleReselect = () => {
    navigation.navigate('HistoryScreen', {
      initialSelected: [left?.id, right?.id].filter(Boolean),
    });
  };

  if (!left || !right) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Need more scans</Text>
        <Text style={{ textAlign: 'center', color: '#8e8e93' }}>Add at least two scans to compare them here.</Text>
        <View style={{ height: 16 }} />
        <Button title="Go to Scan" onPress={() => navigation.getParent()?.navigate('Scan')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>Scan A</Text>
            <Text style={{ color: '#8e8e93', fontSize: 12 }}>{left.formattedDate}</Text>
            <Text style={{ marginTop: 4 }}>Price: {formatCurrency(left.price)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>Scan B</Text>
            <Text style={{ color: '#8e8e93', fontSize: 12 }}>{right.formattedDate}</Text>
            <Text style={{ marginTop: 4 }}>Price: {formatCurrency(right.price)}</Text>
          </View>
        </View>

        {metricRows.map((row) => {
          const leftValue = left.metrics[row.key as MetricKey];
          const rightValue = right.metrics[row.key as MetricKey];
          const leftNumeric = Number.isFinite(leftValue ?? NaN) ? Number(leftValue) : null;
          const rightNumeric = Number.isFinite(rightValue ?? NaN) ? Number(rightValue) : null;
          let leftHighlight = false;
          let rightHighlight = false;
          if (leftNumeric != null && rightNumeric != null) {
            if (row.higherIsBetter) {
              if (leftNumeric > rightNumeric) leftHighlight = true;
              else if (rightNumeric > leftNumeric) rightHighlight = true;
            } else {
              if (leftNumeric < rightNumeric) leftHighlight = true;
              else if (rightNumeric < leftNumeric) rightHighlight = true;
            }
          }
          return (
            <View key={row.key} style={{ marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: '#f8f9fb' }}>
              <Text style={{ fontWeight: '600', marginBottom: 8 }}>{row.label}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, color: '#8e8e93' }}>Scan A</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: leftHighlight ? '#34c759' : '#1c1c1e',
                    }}
                  >
                    {formatNumber(leftNumeric)}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 12, color: '#8e8e93' }}>Scan B</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: rightHighlight ? '#34c759' : '#1c1c1e',
                    }}
                  >
                    {formatNumber(rightNumeric)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#e5e5ea', backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Swap" onPress={handleSwap} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Reselect" onPress={handleReselect} />
        </View>
      </View>
    </View>
  );
}



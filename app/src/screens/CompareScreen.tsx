import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';
import { LinearGradient } from 'expo-linear-gradient';

const BRAND_SLATE = '#0b1917';
const PANEL_SLATE = '#10201d';
const PANEL_OVERLAY = 'rgba(22,49,45,0.72)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#f6fffb';
const TEXT_MUTED = 'rgba(246,255,251,0.65)';
const TEXT_SOFT = 'rgba(246,255,251,0.45)';
const BRAND_MINT = '#2cd0b1';
const HIGHLIGHT_WIN = '#6ff7d7';


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

function ActionButton({ label, onPress, tone = 'solid' }: { label: string; onPress: () => void; tone?: 'solid' | 'secondary' }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionButton, tone === 'secondary' ? styles.actionButtonSecondary : styles.actionButtonPrimary]}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      <Text style={styles.actionButtonLabel}>{label}</Text>
    </Pressable>
  );
}

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
      <LinearGradient colors={[BRAND_SLATE, PANEL_SLATE]} style={styles.screen}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Need more scans</Text>
          <Text style={styles.emptyBody}>Add at least two scans to compare them here.</Text>
          <ActionButton label="Go to Scan" onPress={() => navigation.getParent()?.navigate('Scan')} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BRAND_SLATE, PANEL_SLATE]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.scanRow}>
          <View style={styles.scanCard}>
            <Text style={styles.scanTitle}>Scan A</Text>
            <Text style={styles.scanDate}>{left.formattedDate}</Text>
            <Text style={styles.scanMeta}>Price · {formatCurrency(left.price)}</Text>
          </View>
          <View style={styles.scanCard}>
            <Text style={styles.scanTitle}>Scan B</Text>
            <Text style={styles.scanDate}>{right.formattedDate}</Text>
            <Text style={styles.scanMeta}>Price · {formatCurrency(right.price)}</Text>
          </View>
        </View>

        <View style={styles.metricsShell}>
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
              <View key={row.key} style={styles.metricRow}>
                <Text style={styles.metricLabel}>{row.label}</Text>
                <View style={styles.metricValues}>
                  <View style={styles.metricColumn}>
                    <Text style={styles.metricColumnLabel}>Scan A</Text>
                    <Text style={[styles.metricValue, leftHighlight && styles.metricValueHighlight]}>{formatNumber(leftNumeric)}</Text>
                  </View>
                  <View style={styles.metricColumn}>
                    <Text style={styles.metricColumnLabel}>Scan B</Text>
                    <Text style={[styles.metricValue, rightHighlight && styles.metricValueHighlight]}>{formatNumber(rightNumeric)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.actionsBar}>
        <ActionButton label="Swap" onPress={handleSwap} />
        <ActionButton label="Reselect" onPress={handleReselect} tone="secondary" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 18,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyBody: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 260,
  },
  scanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 18,
  },
  scanCard: {
    flex: 1,
    padding: 18,
    borderRadius: 18,
    backgroundColor: PANEL_OVERLAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    gap: 6,
  },
  scanTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  scanDate: {
    color: TEXT_MUTED,
    fontSize: 13,
  },
  scanMeta: {
    color: TEXT_SOFT,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  metricsShell: {
    borderRadius: 24,
    padding: 12,
    backgroundColor: PANEL_OVERLAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  metricRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  metricLabel: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  metricValues: {
    flexDirection: 'row',
    gap: 18,
  },
  metricColumn: {
    flex: 1,
  },
  metricColumnLabel: {
    color: TEXT_SOFT,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metricValue: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },
  metricValueHighlight: {
    color: HIGHLIGHT_WIN,
  },
  actionsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 16,
    backgroundColor: PANEL_OVERLAY,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: BRAND_MINT,
  },
  actionButtonSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND_MINT,
    backgroundColor: 'transparent',
  },
  actionButtonLabel: {
    color: BRAND_SLATE,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});



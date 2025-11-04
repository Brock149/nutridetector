import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';
import { LinearGradient } from 'expo-linear-gradient';

const BRAND_SLATE = '#0b1917';
const PANEL_SLATE = '#10201d';
const CARD_OVERLAY = 'rgba(22,49,45,0.72)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#f6fffb';
const TEXT_MUTED = 'rgba(246,255,251,0.6)';
const TEXT_SOFT = 'rgba(246,255,251,0.45)';
const BRAND_MINT = '#2cd0b1';
const BRAND_MINT_SOFT = 'rgba(44,208,177,0.12)';

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '—';
  if (!Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
};

type HistoryRouteParams = {
  initialSelected?: string[];
  autoSelectSecond?: boolean;
};

type HistoryRoute = RouteProp<Record<string, HistoryRouteParams>, string>;

function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      style={[styles.actionButton, disabled ? styles.actionButtonDisabled : styles.actionButtonEnabled]}
    >
      <Text style={[styles.actionButtonLabel, disabled && styles.actionButtonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

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
      <Pressable
        onPress={() => toggleSelection(item.id)}
        style={[styles.historyCard, isSelected && styles.historyCardSelected]}
        android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
      >
        <View style={styles.historyRowTop}>
          <View>
            <Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.historyPrice}>{formatCurrency(item.price)}</Text>
          </View>
          <View style={styles.badgeShell}>
            <Text style={[styles.badge, isSelected && styles.badgeSelected]}>{isSelected ? 'Selected' : 'Tap to select'}</Text>
          </View>
        </View>
        <View style={styles.metricDeck}>
          <View style={[styles.metricColumn, styles.metricColumnSpacing]}>
            <Text style={styles.metricLabel}>Calories · per protein</Text>
            <Text style={styles.metricValue}>{formatNumber(item.metrics.caloriesPerProtein, 2)}</Text>
          </View>
          <View style={[styles.metricColumn, styles.metricColumnSpacing]}>
            <Text style={styles.metricLabel}>Cost · per meal</Text>
            <Text style={styles.metricValue}>{formatCurrency(item.metrics.costPerMeal)}</Text>
          </View>
          <View style={styles.metricColumn}>
            <Text style={styles.metricLabel}>Cost · per dollar</Text>
            <Text style={styles.metricValue}>{formatCurrency(item.price)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <LinearGradient colors={[BRAND_SLATE, PANEL_SLATE]} style={styles.screen}>
      <View style={styles.listContainer}>
        {sortedHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptyBody}>Scan items to see them here and line up comparisons.</Text>
          </View>
        ) : (
          <FlatList
            data={sortedHistory}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      <View style={styles.actionsBar}>
        <ActionButton label="Compare" onPress={handleCompare} disabled={selected.length < 2} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 140,
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
    marginBottom: 10,
  },
  emptyBody: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
  },
  historyCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: CARD_OVERLAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    marginBottom: 16,
  },
  historyCardSelected: {
    borderColor: BRAND_MINT,
    backgroundColor: BRAND_MINT_SOFT,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  historyRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  historyDate: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
  },
  historyPrice: {
    color: BRAND_MINT,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  badgeShell: {
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    color: TEXT_SOFT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  badgeSelected: {
    borderColor: BRAND_MINT,
    color: BRAND_SLATE,
    backgroundColor: BRAND_MINT,
  },
  metricDeck: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricColumn: {
    flex: 1,
  },
  metricColumnSpacing: {
    marginRight: 16,
  },
  metricLabel: {
    color: TEXT_SOFT,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  metricValue: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },
  actionsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 26,
    backgroundColor: 'rgba(15,33,30,0.9)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  actionButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonEnabled: {
    backgroundColor: BRAND_MINT,
  },
  actionButtonDisabled: {
    backgroundColor: 'rgba(246,255,251,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  actionButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_SLATE,
    letterSpacing: 0.2,
  },
  actionButtonLabelDisabled: {
    color: TEXT_SOFT,
  },
});



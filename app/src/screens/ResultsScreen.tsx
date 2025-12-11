
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Modal,
  Alert,
  TextInput,
  PanResponder,
  StyleSheet,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';
import { generateScanId } from '../utils/id';

type ServingSizeQuantity = {
  quantity?: number;
  unit?: string;
} | undefined;

type ServingSizeAlt = {
  value?: number;
  unit?: string;
} | undefined;

type MealSliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

type MetricDescriptor = {
  key: string;
  label: string;
  value: string;
  suffix?: string;
};

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max);
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  const fixed = Number(snapped.toFixed(4));
  return clamp(fixed, min, max);
}

const PANEL_GRADIENT = ['#123130', '#102624'] as const;
const HERO_GRADIENT = ['#1f6154', '#154238'] as const;
const PRIMARY_TEXT = '#f6fffb';
const MUTED_TEXT = 'rgba(246,255,251,0.68)';
const RATING_COLORS = {
  excellent: '#6ddcff',
  good: '#42d5b9',
  mid: '#f5c451',
  bad: '#ef6f6f',
} as const;

type MetricRatingBucket = 'excellent' | 'good' | 'mid' | 'bad';

type MetricRating = {
  bucket: MetricRatingBucket;
  label: string;
  color: string;
  trackMax: number;
};

const CAL_PER_PROTEIN_THRESHOLDS = {
  excellentMax: 8,
  goodMax: 13.5,
  midMax: 20,
  trackMax: 26,
} as const;

const rateCaloriesPerProtein = (value?: number): MetricRating | null => {
  if (!Number.isFinite(value) || value == null) return null;
  let bucket: MetricRatingBucket;
  if (value <= CAL_PER_PROTEIN_THRESHOLDS.excellentMax) bucket = 'excellent';
  else if (value <= CAL_PER_PROTEIN_THRESHOLDS.goodMax) bucket = 'good';
  else if (value <= CAL_PER_PROTEIN_THRESHOLDS.midMax) bucket = 'mid';
  else bucket = 'bad';

  return {
    bucket,
    label:
      bucket === 'excellent'
        ? 'Excellent'
        : bucket === 'good'
        ? 'Good'
        : bucket === 'mid'
        ? 'Medium'
        : 'Poor',
    color: RATING_COLORS[bucket],
    trackMax: Math.max(CAL_PER_PROTEIN_THRESHOLDS.trackMax, value + 4),
  };
};

const MealSlider: React.FC<MealSliderProps> = ({ value, min, max, step, onChange }) => {
  const [internal, setInternal] = useState<number>(value);
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const startRatioRef = useRef<number>(0);
  const ratioRef = useRef<number>(0);

  useEffect(() => {
    setInternal((prev) => (Math.abs(prev - value) > 0.0001 ? value : prev));
  }, [value]);

  const emitValue = useCallback(
    (next: number) => {
      const snapped = snapToStep(next, min, max, step);
      setInternal(snapped);
      onChange(snapped);
    },
    [min, max, step, onChange]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: (evt) => {
          if (!trackWidth) return;
          const loc = evt.nativeEvent.locationX;
          const ratioFromTouch = clamp(loc / trackWidth, 0, 1);
          startRatioRef.current = ratioFromTouch;
          emitValue(min + ratioFromTouch * (max - min));
        },
        onPanResponderMove: (_, gestureState) => {
          if (!trackWidth) return;
          const ratio = clamp(startRatioRef.current + gestureState.dx / trackWidth, 0, 1);
          emitValue(min + ratio * (max - min));
        },
        onPanResponderRelease: () => {
          startRatioRef.current = ratioRef.current;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          startRatioRef.current = ratioRef.current;
        },
      }),
    [trackWidth, emitValue, min, max]
  );

  const ratio = trackWidth > 0 ? (internal - min) / (max - min) : 0;
  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const knobLeft = trackWidth * ratio;
  const segments = Math.round((max - min) / step);
  const marks = useMemo(() => new Array(segments + 1).fill(0).map((_, i) => i / segments), [segments]);

  return (
    <View style={styles.sliderWrapper}>
      <View
        style={styles.sliderTrackArea}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (Math.abs(width - trackWidth) > 0.5) {
            setTrackWidth(width);
          }
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.sliderTrackBase}>
          <LinearGradient
            colors={['#2ac3a8', '#1d8d76']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.sliderTrackFill, { width: knobLeft }]}
          />
          {trackWidth > 0
            ? marks.map((p, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.sliderMark,
                    {
                    left: trackWidth * p - 1,
                      opacity: idx === 0 || idx === marks.length - 1 ? 0.75 : 0.35,
                    },
                  ]}
                />
              ))
            : null}
        </View>
        <View
          style={[
            styles.sliderKnob,
            {
              left: Math.min(Math.max(knobLeft - 18, -12), trackWidth - 18),
            },
          ]}
        >
          <LinearGradient colors={['#42d5b9', '#259c83']} style={styles.sliderKnobInner} />
        </View>
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>1×</Text>
        <Text style={styles.sliderLabel}>5×</Text>
      </View>
    </View>
  );
};

const formatNumber = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const formatCurrency = (value: number) => (Number.isFinite(value) ? `$${value.toFixed(value >= 100 ? 0 : 2)}` : '—');
const formatSimple = (value?: number, digits = 1) => (value != null && Number.isFinite(value) ? value.toFixed(digits) : '—');

export default function ResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const {
    price: incomingPrice,
    imageUri,
    calories: initialCalories,
    proteinGrams: initialProtein,
    servingsPerContainer: initialServings,
    rawText,
    servingSize: initialServingSize,
    servingSizeAlt: initialServingSizeAlt,
    scanId: incomingScanId,
    createdAt: incomingCreatedAt,
    autoAdvance,
  } = route.params ?? {};

  const price = typeof incomingPrice === 'number' ? incomingPrice : Number(incomingPrice) || 0;

  const scanIdRef = useRef<string>(incomingScanId ?? generateScanId());
  const createdAtRef = useRef<string>(incomingCreatedAt ?? new Date().toISOString());

  const { goalMode, setGoalMode, addOrUpdateScanResult } = useApp();

  const [calories, setCalories] = useState<number | undefined>(typeof initialCalories === 'number' ? initialCalories : undefined);
  const [proteinGrams, setProteinGrams] = useState<number | undefined>(typeof initialProtein === 'number' ? initialProtein : undefined);
  const [servingsPerContainer, setServingsPerContainer] = useState<number | undefined>(
    typeof initialServings === 'number' ? initialServings : undefined
  );
  const [servingSizeState, setServingSizeState] = useState<ServingSizeQuantity>(initialServingSize);
  const [servingSizeAltState, setServingSizeAltState] = useState<ServingSizeAlt>(initialServingSizeAlt);
  const [mealMultiplier, setMealMultiplier] = useState(2.5);
  const [showDebug, setShowDebug] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editServingQuantity, setEditServingQuantity] = useState('');
  const [editServingUnit, setEditServingUnit] = useState('');
  const [editServingAltValue, setEditServingAltValue] = useState('');
  const [editServingAltUnit, setEditServingAltUnit] = useState('');
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [gaugeWidth, setGaugeWidth] = useState(0);

  const metrics = useMemo(() => {
    const priceSafe = price > 0 ? price : 1;
    const caloriesPerServing = calories ?? 0;
    const proteinPerServing = proteinGrams ?? 0;
    const servingsVal = servingsPerContainer ?? 0;
    const totalCalories = caloriesPerServing * Math.max(1, servingsVal);
    const totalProtein = proteinPerServing * Math.max(1, servingsVal);
    const multiplier = mealMultiplier > 0 ? mealMultiplier : 1;
    const mealsPerContainer = servingsVal > 0 ? servingsVal / multiplier : 0;
    const costPerMeal = mealsPerContainer > 0 ? priceSafe / mealsPerContainer : Infinity;

    return {
      caloriesPerDollar: totalCalories / priceSafe,
      proteinPerDollar: totalProtein / priceSafe,
      caloriesPerProtein: proteinPerServing > 0 ? caloriesPerServing / proteinPerServing : Infinity,
      costPerServing: servingsVal > 0 ? priceSafe / servingsVal : Infinity,
      mealsPerContainer,
      costPerMeal,
    };
  }, [price, calories, proteinGrams, servingsPerContainer, mealMultiplier]);

  const buildScanResult = useCallback((): ScanResult | null => {
    if (!Number.isFinite(price) || price <= 0) {
      return null;
    }

    const normalizedCalories = typeof calories === 'number' && Number.isFinite(calories) && calories > 0 ? calories : undefined;
    const normalizedProtein = typeof proteinGrams === 'number' && Number.isFinite(proteinGrams) && proteinGrams >= 0 ? proteinGrams : undefined;
    const normalizedServings = typeof servingsPerContainer === 'number' && Number.isFinite(servingsPerContainer) && servingsPerContainer > 0
      ? servingsPerContainer
      : undefined;

    const sanitizeMetric = (value: number): number | null => (Number.isFinite(value) ? value : null);

    return {
      id: scanIdRef.current,
      createdAt: createdAtRef.current,
      imageUri,
      price,
      calories: normalizedCalories,
      proteinGrams: normalizedProtein,
      servingsPerContainer: normalizedServings,
      mealMultiplier,
      goalMode,
      metrics: {
        caloriesPerDollar: sanitizeMetric(metrics.caloriesPerDollar),
        proteinPerDollar: sanitizeMetric(metrics.proteinPerDollar),
        caloriesPerProtein: sanitizeMetric(metrics.caloriesPerProtein),
        costPerServing: sanitizeMetric(metrics.costPerServing),
        mealsPerContainer: sanitizeMetric(metrics.mealsPerContainer),
        costPerMeal: sanitizeMetric(metrics.costPerMeal),
      },
      servingSize: servingSizeState,
      servingSizeAlt: servingSizeAltState,
    };
  }, [price, calories, proteinGrams, servingsPerContainer, mealMultiplier, goalMode, metrics, imageUri, servingSizeState, servingSizeAltState]);

  const payload = useMemo(() => buildScanResult(), [buildScanResult]);
  const savedSignatureRef = useRef<string | null>(null);
  const currentScanId = route.params?.scanId;
  const currentCreatedAt = route.params?.createdAt;

  useEffect(() => {
    if (!payload) return;
    const signature = JSON.stringify({
      id: payload.id,
      createdAt: payload.createdAt,
      price: payload.price,
      calories: payload.calories,
      proteinGrams: payload.proteinGrams,
      servingsPerContainer: payload.servingsPerContainer,
      mealMultiplier: payload.mealMultiplier,
      goalMode: payload.goalMode,
      metrics: payload.metrics,
      servingSize: payload.servingSize,
      servingSizeAlt: payload.servingSizeAlt,
    });
    if (savedSignatureRef.current !== signature) {
      savedSignatureRef.current = signature;
      addOrUpdateScanResult(payload);
    }
    if (currentScanId !== payload.id || currentCreatedAt !== payload.createdAt) {
      navigation.setParams({ scanId: payload.id, createdAt: payload.createdAt });
    }
  }, [payload, addOrUpdateScanResult, navigation, currentScanId, currentCreatedAt]);

  useEffect(() => {
    if (autoAdvance) {
      navigation.setParams({ autoAdvance: undefined });
    }
  }, [autoAdvance, navigation]);

  const handleOpenEdit = useCallback(() => {
    setEditServingQuantity(
      servingSizeState?.quantity != null && Number.isFinite(servingSizeState.quantity)
        ? String(servingSizeState.quantity)
        : ''
    );
    setEditServingUnit(servingSizeState?.unit ?? '');
    setEditServingAltValue(
      servingSizeAltState?.value != null && Number.isFinite(servingSizeAltState.value)
        ? String(servingSizeAltState.value)
        : ''
    );
    setEditServingAltUnit(servingSizeAltState?.unit ?? '');
    setEditVisible(true);
  }, [servingSizeState, servingSizeAltState]);

  const handleSaveEdits = useCallback(() => {
    setServingSizeState(() => {
      const qty = parseFloat(editServingQuantity);
      const hasQty = !Number.isNaN(qty) && qty > 0;
      const unit = editServingUnit.trim();
      if (hasQty || unit) {
        return {
          quantity: hasQty ? qty : undefined,
          unit: unit || undefined,
        };
      }
      return undefined;
    });

    setServingSizeAltState(() => {
      const val = parseFloat(editServingAltValue);
      const hasVal = !Number.isNaN(val) && val > 0;
      const unit = editServingAltUnit.trim();
      if (hasVal || unit) {
        return {
          value: hasVal ? val : undefined,
          unit: unit || undefined,
        };
      }
      return undefined;
    });

    setEditVisible(false);
  }, [editServingQuantity, editServingUnit, editServingAltValue, editServingAltUnit]);

  const handleComparePress = useCallback(() => {
    const nextPayload = buildScanResult();
    if (!nextPayload) {
      Alert.alert('Missing price', 'Enter a valid price before comparing.');
      return;
    }
    addOrUpdateScanResult(nextPayload);
    navigation.getParent()?.navigate('Compare', {
      screen: 'HistoryScreen',
      params: {
        initialSelected: [nextPayload.id],
        autoSelectSecond: true,
      },
    });
  }, [buildScanResult, addOrUpdateScanResult, navigation]);

  const topMetrics = useMemo<MetricDescriptor[]>(
    () => [
      { key: 'costPerMeal', label: 'Cost per meal', value: formatCurrency(metrics.costPerMeal) },
      { key: 'caloriesPerProtein', label: 'Calories per protein', value: formatNumber(metrics.caloriesPerProtein, 2) },
    ],
    [metrics.costPerMeal, metrics.caloriesPerProtein]
  );

  const supportingMetrics = useMemo<MetricDescriptor[]>(
    () => [
      { key: 'proteinPerDollar', label: 'Protein per dollar', value: formatNumber(metrics.proteinPerDollar, 1), suffix: 'g' },
      { key: 'caloriesPerDollar', label: 'Calories per dollar', value: formatNumber(metrics.caloriesPerDollar, 0), suffix: 'cals' },
      { key: 'costPerServing', label: 'Cost per serving', value: formatCurrency(metrics.costPerServing) },
      { key: 'caloriesPerServing', label: 'Calories per serving', value: formatSimple(calories, 0), suffix: 'cals' },
      { key: 'proteinPerServing', label: 'Protein per serving', value: formatSimple(proteinGrams, 1), suffix: 'g' },
    ],
    [metrics, calories, proteinGrams]
  );

  const statRows = useMemo<MetricDescriptor[][]>(() => {
    const rows: MetricDescriptor[][] = [];
    for (let i = 0; i < supportingMetrics.length; i += 3) {
      rows.push(supportingMetrics.slice(i, i + 3));
    }
    return rows;
  }, [supportingMetrics]);

  const showDevTools = __DEV__ && !!rawText;
  const caloriesPerProteinRating = useMemo(() => rateCaloriesPerProtein(metrics.caloriesPerProtein), [metrics.caloriesPerProtein]);
  const caloriesPerProteinPointerRatio = useMemo(() => {
    if (!caloriesPerProteinRating) return 0;
    const value = Number.isFinite(metrics.caloriesPerProtein) ? (metrics.caloriesPerProtein ?? 0) : 0;
    const section = 0.25;
    const { excellentMax, goodMax, midMax, trackMax } = CAL_PER_PROTEIN_THRESHOLDS;
    if (value <= excellentMax) {
      return clamp((value / excellentMax) * section, 0, section);
    }
    if (value <= goodMax) {
      return clamp(section + ((value - excellentMax) / (goodMax - excellentMax)) * section, section, section * 2);
    }
    if (value <= midMax) {
      return clamp(section * 2 + ((value - goodMax) / (midMax - goodMax)) * section, section * 2, section * 3);
    }
    const upper = Math.max(trackMax, midMax + 8, value + 1);
    return clamp(section * 3 + ((Math.min(value, upper) - midMax) / (upper - midMax)) * section, section * 3, 1);
  }, [metrics.caloriesPerProtein, caloriesPerProteinRating]);
  const caloriesPerProteinBarSegments = useMemo(() => {
    if (!caloriesPerProteinRating) return [];
    const total = caloriesPerProteinRating.trackMax;
    const lenExcellent = CAL_PER_PROTEIN_THRESHOLDS.excellentMax;
    const lenGood = CAL_PER_PROTEIN_THRESHOLDS.goodMax - CAL_PER_PROTEIN_THRESHOLDS.excellentMax;
    const lenMid = CAL_PER_PROTEIN_THRESHOLDS.midMax - CAL_PER_PROTEIN_THRESHOLDS.goodMax;
    const lenBad = Math.max(total - CAL_PER_PROTEIN_THRESHOLDS.midMax, 0.001);
    return [
      { key: 'excellent', color: RATING_COLORS.excellent, flex: lenExcellent },
      { key: 'good', color: RATING_COLORS.good, flex: lenGood },
      { key: 'mid', color: RATING_COLORS.mid, flex: lenMid },
      { key: 'bad', color: RATING_COLORS.bad, flex: lenBad },
    ];
  }, [caloriesPerProteinRating]);

  return (
    <LinearGradient colors={PANEL_GRADIENT} style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + 4,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
      >
        <View style={styles.panelContent}>
          <View style={styles.heroRow}>
            <View style={styles.imageFrame}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="contain" />
              ) : (
                <View style={styles.heroImageFallback}>
                  <Text style={styles.heroImageFallbackText}>Capture preview</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.metricRow}>
            {topMetrics.map((metric) => {
              const isCalPerProtein = metric.key === 'caloriesPerProtein';
              const isActive = activeMetric === metric.key;
              const rating = isCalPerProtein ? caloriesPerProteinRating : null;
              return (
                <Pressable
                  key={metric.key}
                  style={({ pressed }) => [
                    styles.metricCell,
                    isActive ? styles.metricCellActive : null,
                    pressed ? styles.metricCellPressed : null,
                  ]}
                  onPress={() => {
                    if (isCalPerProtein) {
                      setActiveMetric(isActive ? null : metric.key);
                    } else {
                      setActiveMetric(null);
                    }
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${metric.label} ${metric.value}${
                    rating ? ` rated ${rating.label}` : ''
                  }`}
                >
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={[styles.metricValue, rating ? { color: rating.color } : null]}>
                    {metric.value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {activeMetric === 'caloriesPerProtein' && caloriesPerProteinRating ? (
            <View style={styles.metricDetailCard}>
              <View style={styles.metricDetailHeader}>
                <View style={styles.metricDetailValueBlock}>
                  <Text style={styles.metricDetailLabel}>Calories per protein</Text>
                  <View style={styles.metricDetailValueRow}>
                    <Text style={styles.metricDetailValue}>{formatNumber(metrics.caloriesPerProtein, 2)}</Text>
                    <Text style={styles.metricDetailUnit}>cal / g protein</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.metricDetailBadge,
                    {
                      borderColor: caloriesPerProteinRating.color,
                      backgroundColor: `${caloriesPerProteinRating.color}1A`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.metricBadgeDot,
                      { backgroundColor: caloriesPerProteinRating.color, marginRight: 6 },
                    ]}
                  />
                  <Text style={[styles.metricBadgeText, { color: caloriesPerProteinRating.color }]}>
                    {caloriesPerProteinRating.label}
                  </Text>
                </View>
              </View>

              <View style={styles.metricGaugeContainer}>
                <View style={styles.metricGaugeMarkersRow} pointerEvents="none">
                  <View style={styles.metricGaugeMarkerSpacer} />
                  <Text style={styles.metricGaugeMarkerText}>{CAL_PER_PROTEIN_THRESHOLDS.excellentMax}</Text>
                  <Text style={styles.metricGaugeMarkerText}>{CAL_PER_PROTEIN_THRESHOLDS.goodMax}</Text>
                  <Text style={styles.metricGaugeMarkerText}>{CAL_PER_PROTEIN_THRESHOLDS.midMax}</Text>
                  <View style={styles.metricGaugeMarkerSpacer} />
                </View>

                <View style={styles.metricGaugePointerRow}>
                  <View
                    style={styles.metricGaugeTrack}
                    onLayout={(e) => setGaugeWidth(e.nativeEvent.layout.width)}
                  >
                    <View style={styles.metricGaugeTrackSegments}>
                      <View
                        style={[
                          styles.metricGaugeTrackSegment,
                          { flex: 1, backgroundColor: RATING_COLORS.excellent },
                        ]}
                      />
                      <View style={styles.metricGaugeTrackDivider} />
                      <View
                        style={[
                          styles.metricGaugeTrackSegment,
                          { flex: 1, backgroundColor: RATING_COLORS.good },
                        ]}
                      />
                      <View style={styles.metricGaugeTrackDivider} />
                      <View
                        style={[
                          styles.metricGaugeTrackSegment,
                          { flex: 1, backgroundColor: RATING_COLORS.mid },
                        ]}
                      />
                      <View style={styles.metricGaugeTrackDivider} />
                      <View
                        style={[
                          styles.metricGaugeTrackSegment,
                          { flex: 1, backgroundColor: RATING_COLORS.bad },
                        ]}
                      />
                    </View>
                    <View
                      style={[
                        styles.metricGaugePointer,
                        {
                          left: gaugeWidth * caloriesPerProteinPointerRatio - 6,
                          borderColor: caloriesPerProteinRating.color,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.metricGaugeLabelsRow} pointerEvents="none">
                  <View style={styles.metricGaugeLabelItem}>
                    <Text style={[styles.metricGaugeLabelText, { color: RATING_COLORS.excellent }]}>Excellent</Text>
                  </View>
                  <View style={styles.metricGaugeLabelItem}>
                    <Text style={[styles.metricGaugeLabelText, { color: RATING_COLORS.good }]}>Good</Text>
                  </View>
                  <View style={styles.metricGaugeLabelItem}>
                    <Text style={[styles.metricGaugeLabelText, { color: RATING_COLORS.mid }]}>Medium</Text>
                  </View>
                  <View style={styles.metricGaugeLabelItem}>
                    <Text style={[styles.metricGaugeLabelText, { color: RATING_COLORS.bad }]}>Poor</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.sliderSection}>
            <View style={styles.sliderHeaderRow}>
              <Text style={styles.sliderTitle}>Meal multiplier</Text>
              <View style={styles.sliderBadge}>
                <Text style={styles.sliderBadgeText}>{mealMultiplier.toFixed(2)}×</Text>
              </View>
            </View>
            <MealSlider value={mealMultiplier} min={1} max={5} step={0.25} onChange={setMealMultiplier} />
            <View style={styles.sliderMetaRow}>
              <View style={styles.sliderMetaItem}>
                <Text style={styles.sliderMetaLabel}>Meals per container</Text>
                <Text style={styles.sliderMetaValue}>{formatNumber(metrics.mealsPerContainer, 2)}</Text>
              </View>
              <View style={styles.sliderMetaItem}>
                <Text style={styles.sliderMetaLabel}>Cost per meal</Text>
                <Text style={styles.sliderMetaValue}>{formatCurrency(metrics.costPerMeal)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            {statRows.map((row, idx) => (
              <View key={idx} style={styles.statsRow}>
                {row.map((metric) => (
                  <View key={metric.key} style={styles.statsCell}>
                    <Text style={styles.statsLabel}>{metric.label}</Text>
                    <View style={styles.statsValueRow}>
                      <Text style={styles.statsValue}>{metric.value}</Text>
                      {metric.suffix ? <Text style={styles.statsSuffix}>{metric.suffix}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showDebug} transparent animationType="slide" onRequestClose={() => setShowDebug(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>OCR text</Text>
            <ScrollView style={styles.modalScroll}>
              <Text selectable style={styles.modalBody}>
                {rawText}
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalPrimary}
                onPress={async () => {
                  await Clipboard.setStringAsync(String(rawText ?? ''));
                  Alert.alert('Copied to clipboard');
                }}
              >
                <Text style={styles.modalPrimaryText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.modalSecondary} onPress={() => setShowDebug(false)}>
                <Text style={styles.modalSecondaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, styles.editModalContent]}>
            <Text style={styles.modalTitle}>Edit extracted values</Text>
            <ScrollView contentContainerStyle={styles.editFields}>
              <View style={styles.editFieldBlock}>
                <Text style={styles.editLabel}>Calories</Text>
                <TextInput
                  value={calories != null ? String(calories) : ''}
                  onChangeText={(t) => setCalories(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="number-pad"
                  placeholder="e.g. 200"
                  style={styles.editInput}
                  placeholderTextColor={MUTED_TEXT}
                />
              </View>
              <View style={styles.editFieldBlock}>
                <Text style={styles.editLabel}>Protein (g)</Text>
                <TextInput
                  value={proteinGrams != null ? String(proteinGrams) : ''}
                  onChangeText={(t) => setProteinGrams(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="number-pad"
                  placeholder="e.g. 8"
                  style={styles.editInput}
                  placeholderTextColor={MUTED_TEXT}
                />
              </View>
              <View style={styles.editFieldBlock}>
                <Text style={styles.editLabel}>Servings per container</Text>
                <TextInput
                  value={servingsPerContainer != null ? String(servingsPerContainer) : ''}
                  onChangeText={(t) => setServingsPerContainer(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 8"
                  style={styles.editInput}
                  placeholderTextColor={MUTED_TEXT}
                />
              </View>
              <View style={styles.editRow}>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Serving qty</Text>
                <TextInput
                  value={editServingQuantity}
                  onChangeText={setEditServingQuantity}
                  keyboardType="decimal-pad"
                    placeholder="e.g. 0.75"
                    style={styles.editInput}
                    placeholderTextColor={MUTED_TEXT}
                />
                </View>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Serving unit</Text>
                <TextInput
                  value={editServingUnit}
                  onChangeText={setEditServingUnit}
                    placeholder="cup"
                    style={styles.editInput}
                    placeholderTextColor={MUTED_TEXT}
                  />
                </View>
              </View>
              <View style={styles.editRow}>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Alt (g/ml)</Text>
                <TextInput
                  value={editServingAltValue}
                  onChangeText={setEditServingAltValue}
                  keyboardType="decimal-pad"
                    placeholder="e.g. 228"
                    style={styles.editInput}
                    placeholderTextColor={MUTED_TEXT}
                />
                </View>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Alt unit</Text>
                <TextInput
                  value={editServingAltUnit}
                  onChangeText={setEditServingAltUnit}
                    placeholder="g"
                    style={styles.editInput}
                    placeholderTextColor={MUTED_TEXT}
                />
              </View>
                  </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalPrimary} onPress={handleSaveEdits}>
                <Text style={styles.modalPrimaryText}>Save changes</Text>
              </Pressable>
              <Pressable style={styles.modalSecondary} onPress={() => setEditVisible(false)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  panelContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 18,
  },
  heroRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  heroImageFallbackText: {
    color: MUTED_TEXT,
  },
  heroDialWrapper: {
    width: 200,
    alignItems: 'center',
    gap: 12,
  },
  heroDialBackground: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroDialInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,36,33,0.7)',
  },
  heroDialValue: {
    color: PRIMARY_TEXT,
    fontSize: 28,
    fontWeight: '700',
  },
  heroDialLabel: {
    color: MUTED_TEXT,
    fontSize: 13,
    marginTop: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  heroMetaItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetaLabel: {
    color: MUTED_TEXT,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroMetaValue: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sliderSection: {
    gap: 12,
  },
  sliderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderTitle: {
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  sliderBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sliderBadgeText: {
    color: PRIMARY_TEXT,
    fontWeight: '600',
  },
  sliderWrapper: {
    marginTop: 4,
  },
  sliderTrackArea: {
    height: 52,
    justifyContent: 'center',
  },
  sliderTrackBase: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  sliderTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 6,
  },
  sliderMark: {
    position: 'absolute',
    width: 2,
    height: 24,
    top: -6,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
  sliderKnob: {
    position: 'absolute',
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(6,24,21,0.8)',
    shadowColor: '#42d5b9',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 6,
  },
  sliderKnobInner: {
    flex: 1,
    borderRadius: 15,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sliderLabel: {
    color: MUTED_TEXT,
    fontSize: 11,
  },
  sliderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderMetaItem: {
    flex: 1,
  },
  sliderMetaLabel: {
    color: MUTED_TEXT,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  sliderMetaValue: {
    color: PRIMARY_TEXT,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  statsGrid: {
    marginTop: 12,
    gap: 18,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 18,
  },
  statsCell: {
    flex: 1,
    minWidth: 100,
  },
  statsLabel: {
    color: MUTED_TEXT,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  statsValue: {
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  statsSuffix: {
    color: MUTED_TEXT,
    fontSize: 12,
    marginBottom: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'rgba(9,30,26,0.95)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(170,239,219,0.25)',
    gap: 12,
  },
  modalTitle: {
    color: PRIMARY_TEXT,
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalBody: {
    color: PRIMARY_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalPrimary: {
    flex: 1,
    backgroundColor: '#2cd0b1',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalPrimaryText: {
    color: '#083229',
    fontWeight: '600',
  },
  modalSecondary: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalSecondaryText: {
    color: PRIMARY_TEXT,
    fontWeight: '600',
  },
  editModalContent: {
    maxHeight: '80%',
  },
  editFields: {
    gap: 16,
  },
  editFieldBlock: {
    width: '100%',
  },
  editLabel: {
    color: MUTED_TEXT,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.27)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: PRIMARY_TEXT,
    backgroundColor: 'rgba(9,30,26,0.7)',
  },
  editRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editHalf: {
    flex: 1,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    paddingTop: 12,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 14,
  },
  metricCellActive: {
    backgroundColor: 'rgba(44,208,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(66,213,185,0.35)',
  },
  metricCellPressed: {
    opacity: 0.8,
  },
  metricLabel: {
    color: MUTED_TEXT,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    color: PRIMARY_TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  metricBadge: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  metricBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricDetailCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(170,239,219,0.25)',
    backgroundColor: 'rgba(9,30,26,0.9)',
    gap: 12,
  },
  metricDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metricDetailValueBlock: {
    flex: 1,
    gap: 4,
  },
  metricDetailLabel: {
    color: MUTED_TEXT,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricDetailValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  metricDetailValue: {
    color: PRIMARY_TEXT,
    fontSize: 24,
    fontWeight: '700',
  },
  metricDetailUnit: {
    color: MUTED_TEXT,
    fontSize: 12,
    marginBottom: 2,
  },
  metricDetailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  metricGauge: {
    marginTop: 12,
    gap: 8,
  },
  metricGaugeContainer: {
    borderRadius: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(9,30,26,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  metricGaugePointerRow: {
    marginTop: 0,
  },
  metricGaugeTrack: {
    height: 14,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metricGaugeTrackSegments: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  metricGaugeTrackSegment: {
    height: '100%',
  },
  metricGaugeTrackDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    opacity: 0.6,
  },
  metricGaugeMarkersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  metricGaugeMarkerText: {
    color: MUTED_TEXT,
    fontSize: 12,
  },
  metricGaugeMarkerSpacer: {
    width: 6,
  },
  metricGaugeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  metricGaugeLabelItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricGaugeLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricGaugePointer: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: 'rgba(8,50,41,0.95)',
    transform: [{ translateX: -6 }],
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Button, Image, ScrollView, Modal, Alert, TextInput, PanResponder } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp, ScanResult } from '../context/AppContext';
import { generateScanId } from '../utils/id';

type FieldReadingParam = {
  className: string;
  detectionScore: number;
  parseConfidence: number;
  combinedConfidence: number;
  rawText?: string;
  value?: number;
  unit?: string;
  cropUri?: string;
};

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

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max);
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  const fixed = Number(snapped.toFixed(4));
  return clamp(fixed, min, max);
}

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

  const updateFromLocation = useCallback(
    (locationX: number) => {
      if (!trackWidth) return;
      const ratio = clamp(locationX / trackWidth, 0, 1);
      const raw = min + ratio * (max - min);
      emitValue(raw);
    },
    [trackWidth, min, max, emitValue]
  );

  const panResponder = React.useMemo(
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
  const marks = React.useMemo(() => new Array(segments + 1).fill(0).map((_, i) => i / segments), [segments]);

  return (
    <View style={{ marginVertical: 12, paddingHorizontal: 16 }}>
      <View
        style={{ height: 44, justifyContent: 'center' }}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          if (Math.abs(width - trackWidth) > 0.5) {
            setTrackWidth(width);
          }
        }}
        {...panResponder.panHandlers}
      >
        <View style={{ height: 8, borderRadius: 4, backgroundColor: '#d1d1d6', overflow: 'visible', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: knobLeft, backgroundColor: '#007aff', borderRadius: 4 }} />
          {trackWidth > 0
            ? marks.map((p, idx) => (
                <View
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: trackWidth * p - 1,
                    top: -6,
                    width: 2,
                    height: 20,
                    backgroundColor: '#ffffff',
                    borderRadius: 1,
                    opacity: idx === 0 || idx === marks.length - 1 ? 0.8 : 0.4,
                  }}
                />
              ))
            : null}
        </View>
        <View
          style={{
            position: 'absolute',
            left: Math.min(Math.max(knobLeft - 14, -6), trackWidth - 14),
            top: 6,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: '#007aff',
            borderWidth: 2,
            borderColor: '#ffffff',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 12, color: '#8e8e93' }}>1×</Text>
        <Text style={{ fontSize: 12, color: '#8e8e93' }}>5×</Text>
      </View>
    </View>
  );
};

const formatNumber = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

export default function ResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    price: incomingPrice,
    imageUri,
    calories: initialCalories,
    proteinGrams: initialProtein,
    servingsPerContainer: initialServings,
    rawText,
    fieldReadings = [],
    servingSize: initialServingSize,
    servingSizeAlt: initialServingSizeAlt,
    scanId: incomingScanId,
    createdAt: incomingCreatedAt,
  } = route.params ?? {};

  const price = typeof incomingPrice === 'number' ? incomingPrice : Number(incomingPrice) || 0;

  const scanIdRef = useRef<string>(incomingScanId ?? generateScanId());
  const createdAtRef = useRef<string>(incomingCreatedAt ?? new Date().toISOString());

  const { goalMode, setGoalMode, addOrUpdateScanResult } = useApp();

  const [calories, setCalories] = useState<number | undefined>(typeof initialCalories === 'number' ? initialCalories : undefined);
  const [proteinGrams, setProteinGrams] = useState<number | undefined>(typeof initialProtein === 'number' ? initialProtein : undefined);
  const [servingsPerContainer, setServingsPerContainer] = useState<number | undefined>(typeof initialServings === 'number' ? initialServings : undefined);

  const [servingSizeState, setServingSizeState] = useState<ServingSizeQuantity>(initialServingSize);
  const [servingSizeAltState, setServingSizeAltState] = useState<ServingSizeAlt>(initialServingSizeAlt);

  const [mealMultiplier, setMealMultiplier] = useState(2.5);

  const [showDebug, setShowDebug] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editServingQuantity, setEditServingQuantity] = useState('');
  const [editServingUnit, setEditServingUnit] = useState('');
  const [editServingAltValue, setEditServingAltValue] = useState('');
  const [editServingAltUnit, setEditServingAltUnit] = useState('');

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
    const normalizedServings = typeof servingsPerContainer === 'number' && Number.isFinite(servingsPerContainer) && servingsPerContainer > 0 ? servingsPerContainer : undefined;

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
    const payload = buildScanResult();
    if (!payload) {
      Alert.alert('Missing price', 'Enter a valid price before comparing.');
      return;
    }
    addOrUpdateScanResult(payload);
    navigation.getParent()?.navigate('Compare', {
      screen: 'HistoryScreen',
      params: {
        initialSelected: [payload.id],
        autoSelectSecond: true,
      },
    });
  }, [buildScanResult, addOrUpdateScanResult, navigation]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '600' }}>Results</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cut" onPress={() => setGoalMode('cut')} color={goalMode === 'cut' ? '#007aff' : undefined} />
            <Button title="Bulk" onPress={() => setGoalMode('bulk')} color={goalMode === 'bulk' ? '#007aff' : undefined} />
          </View>
        </View>
        <View style={{ height: 16 }} />
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: 180, backgroundColor: '#eee' }} />
        ) : (
          <View style={{ width: '100%', height: 180, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}>
            <Text>Image preview</Text>
          </View>
        )}
        <View style={{ height: 16 }} />
        <Text>Price: {Number.isFinite(price) && price > 0 ? `$${price.toFixed(2)}` : '—'}</Text>
        <View style={{ height: 8 }} />
        <Text>Calories/$: {formatNumber(metrics.caloriesPerDollar)}</Text>
        <Text>Protein/$: {formatNumber(metrics.proteinPerDollar)}</Text>
        <Text>Cal/Protein: {Number.isFinite(metrics.caloriesPerProtein) ? metrics.caloriesPerProtein.toFixed(2) : '∞'}</Text>
        <Text>Cost/Serving: {formatNumber(metrics.costPerServing)}</Text>
        <Text>Meal multiplier: {mealMultiplier.toFixed(2)} servings/meal</Text>
        <MealSlider value={mealMultiplier} min={1} max={5} step={0.25} onChange={setMealMultiplier} />
        <Text>Meals/Container: {formatNumber(metrics.mealsPerContainer)}</Text>
        <Text>Cost/Meal: {formatNumber(metrics.costPerMeal)}</Text>
        {(servingSizeState || servingSizeAltState) ? (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#f8f9fb', borderWidth: 1, borderColor: '#d1d1d6' }}>
            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Serving size</Text>
            {servingSizeState ? (
              <Text>
                {servingSizeState.quantity != null ? `${servingSizeState.quantity}` : '—'} {servingSizeState.unit ?? ''}
              </Text>
            ) : null}
            {servingSizeAltState ? (
              <Text>
                {servingSizeAltState.value != null ? `${servingSizeAltState.value}` : '—'} {servingSizeAltState.unit ?? ''}
              </Text>
            ) : null}
          </View>
        ) : null}
        {(rawText || fieldReadings.length) ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            {rawText ? (
              <Button title="Show OCR debug" onPress={() => setShowDebug(true)} />
            ) : null}
            {fieldReadings.length ? (
              <Button title="Show field confidences" onPress={() => setShowFields(true)} />
            ) : null}
          </View>
        ) : null}
        <View style={{ marginTop: 12, gap: 8 }}>
          <Button title="Edit values" onPress={handleOpenEdit} />
          <Button title="Compare" onPress={handleComparePress} />
        </View>
      </ScrollView>

      <Modal visible={!!showDebug} transparent animationType="slide" onRequestClose={() => setShowDebug(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, maxHeight: '70%', padding: 16 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>OCR Text (debug)</Text>
            <ScrollView>
              <Text selectable>{rawText}</Text>
            </ScrollView>
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button title="Copy OCR debug" onPress={async () => { await Clipboard.setStringAsync(String(rawText ?? '')); Alert.alert('Copied'); }} />
              <Button title="Close" onPress={() => setShowDebug(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, padding: 16 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Edit extracted values</Text>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Text>Calories</Text>
                <TextInput
                  value={calories != null ? String(calories) : ''}
                  onChangeText={(t) => setCalories(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="number-pad"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }}
                />
                <Text>Protein (g)</Text>
                <TextInput
                  value={proteinGrams != null ? String(proteinGrams) : ''}
                  onChangeText={(t) => setProteinGrams(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="number-pad"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }}
                />
                <Text>Servings</Text>
                <TextInput
                  value={servingsPerContainer != null ? String(servingsPerContainer) : ''}
                  onChangeText={(t) => setServingsPerContainer(t.trim() === '' ? undefined : Number(t))}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }}
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Text>Serving qty</Text>
                <TextInput
                  value={editServingQuantity}
                  onChangeText={setEditServingQuantity}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 70, backgroundColor: '#fff' }}
                />
                <Text>Unit</Text>
                <TextInput
                  value={editServingUnit}
                  onChangeText={setEditServingUnit}
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 90, backgroundColor: '#fff' }}
                />
                <Text>Alt (g/ml)</Text>
                <TextInput
                  value={editServingAltValue}
                  onChangeText={setEditServingAltValue}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }}
                />
                <Text>Alt unit</Text>
                <TextInput
                  value={editServingAltUnit}
                  onChangeText={setEditServingAltUnit}
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 70, backgroundColor: '#fff' }}
                />
              </View>
            </ScrollView>
            <View style={{ marginTop: 12, gap: 8 }}>
              <Button title="Save" onPress={handleSaveEdits} />
              <Button title="Cancel" onPress={() => setEditVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!showFields} transparent animationType="slide" onRequestClose={() => setShowFields(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, maxHeight: '75%', padding: 16 }}>
            <Text style={{ fontWeight: '600', marginBottom: 12 }}>Field confidence breakdown</Text>
            <ScrollView>
              {fieldReadings.map((field: FieldReadingParam, idx: number) => {
                const pct = Math.round((field.combinedConfidence ?? 0) * 100);
                return (
                  <View key={`${field.className}-${idx}`} style={{ marginBottom: 12, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#d1d1d6', backgroundColor: '#f8f9fb' }}>
                    <Text style={{ fontWeight: '600' }}>{field.className}</Text>
                    <Text style={{ fontSize: 12, color: '#636366' }}>Detected: {(field.detectionScore * 100).toFixed(0)}%</Text>
                    <Text style={{ fontSize: 12, color: '#636366' }}>OCR parse: {(field.parseConfidence * 100).toFixed(0)}%</Text>
                    <Text style={{ fontSize: 12, color: pct >= 80 ? '#34c759' : pct >= 55 ? '#ffcc00' : '#ff3b30' }}>Overall: {pct}%</Text>
                    {field.value != null ? (
                      <Text style={{ marginTop: 4 }}>Value: {field.value} {field.unit ?? ''}</Text>
                    ) : null}
                    {field.rawText ? <Text style={{ marginTop: 4, fontSize: 12, color: '#8e8e93' }}>{field.rawText}</Text> : null}
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ marginTop: 12 }}>
              <Button title="Close" onPress={() => setShowFields(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}



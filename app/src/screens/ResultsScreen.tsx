import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Button, Image, ScrollView, Modal, Alert, TextInput, TouchableOpacity, PanResponder } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { useApp } from '../context/AppContext';

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

export default function ResultsScreen() {
  const route = useRoute<any>();
  const { goalMode, setGoalMode } = useApp();
  const {
    imageUri,
    price,
    calories: pCalories,
    proteinGrams: pProtein,
    servingsPerContainer: pServings,
    rawText,
    fieldReadings = [],
    servingSize,
    servingSizeAlt,
  } = route.params ?? {};
  const [calories, setCalories] = useState<number>(pCalories ?? 0);
  const [proteinGrams, setProteinGrams] = useState<number>(pProtein ?? 0);
  const [servingsPerContainer, setServingsPerContainer] = useState<number>(pServings ?? 1);
  const [editVisible, setEditVisible] = useState(false);
  const [editServingQuantity, setEditServingQuantity] = useState<string>(servingSize?.quantity != null ? String(servingSize.quantity) : '');
  const [editServingUnit, setEditServingUnit] = useState<string>(servingSize?.unit ?? '');
  const [editServingAltValue, setEditServingAltValue] = useState<string>(servingSizeAlt?.value != null ? String(servingSizeAlt.value) : '');
  const [editServingAltUnit, setEditServingAltUnit] = useState<string>(servingSizeAlt?.unit ?? '');

  const [mealMultiplier, setMealMultiplier] = useState(2.5);

  const metrics = useMemo(() => {
    const p = Number(price) || 1;
    const totalCalories = calories * Math.max(1, Number(servingsPerContainer) || 1);
    const totalProtein = (proteinGrams || 0) * Math.max(1, Number(servingsPerContainer) || 1);
    const servingsVal = Math.max(0, Number(servingsPerContainer) || 0);
    const multiplier = mealMultiplier > 0 ? mealMultiplier : 1;
    const mealsPerContainer = servingsVal > 0 ? servingsVal / multiplier : 0;
    const costPerMeal = mealsPerContainer > 0 ? p / mealsPerContainer : Infinity;
    return {
      // New: factor in servings per container
      caloriesPerDollar: totalCalories / p,
      // New: factor total protein (per serving × servings)
      proteinPerDollar: totalProtein / p,
      // Switch to Cal/Protein per serving (avoid div by zero)
      caloriesPerProtein: proteinGrams > 0 ? calories / proteinGrams : Infinity,
      // New metric: cost per serving
      costPerServing: p / Math.max(1, Number(servingsPerContainer) || 1),
      mealsPerContainer,
      costPerMeal,
    };
  }, [price, calories, proteinGrams, servingsPerContainer, mealMultiplier]);

  const [showDebug, setShowDebug] = useState(false);
  const [showFields, setShowFields] = useState(false);

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
      <Text>Price: ${price?.toFixed ? price.toFixed(2) : price}</Text>
      <View style={{ height: 8 }} />
      <Text>Calories/$: {metrics.caloriesPerDollar.toFixed(2)}</Text>
      <Text>Protein/$: {metrics.proteinPerDollar.toFixed(2)}</Text>
      <Text>Cal/Protein: {Number.isFinite(metrics.caloriesPerProtein) ? metrics.caloriesPerProtein.toFixed(2) : '∞'}</Text>
      <Text>Cost/Serving: {metrics.costPerServing.toFixed(2)}</Text>
      <Text>Meal multiplier: {mealMultiplier.toFixed(2)} servings/meal</Text>
      <MealSlider value={mealMultiplier} min={1} max={5} step={0.25} onChange={setMealMultiplier} />
      <Text>Meals/Container: {metrics.mealsPerContainer.toFixed(2)}</Text>
      <Text>Cost/Meal: {Number.isFinite(metrics.costPerMeal) ? metrics.costPerMeal.toFixed(2) : '—'}</Text>
      {servingSize || servingSizeAlt ? (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#f8f9fb', borderWidth: 1, borderColor: '#d1d1d6' }}>
          <Text style={{ fontWeight: '600', marginBottom: 6 }}>Serving size</Text>
          {servingSize ? (
            <Text>
              {servingSize.quantity != null ? `${servingSize.quantity}` : '—'} {servingSize.unit ?? ''}
            </Text>
          ) : null}
          {servingSizeAlt ? (
            <Text>
              {servingSizeAlt.value != null ? `${servingSizeAlt.value}` : '—'} {servingSizeAlt.unit ?? ''}
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
      <View style={{ marginTop: 12 }}>
        <Button title="Edit values" onPress={() => setEditVisible(true)} />
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
                <TextInput value={String(calories || '')} onChangeText={(t)=>setCalories(Number(t)||0)} keyboardType="number-pad" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }} />
                <Text>Protein (g)</Text>
                <TextInput value={String(proteinGrams || '')} onChangeText={(t)=>setProteinGrams(Number(t)||0)} keyboardType="number-pad" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }} />
                <Text>Servings</Text>
                <TextInput value={String(servingsPerContainer || '')} onChangeText={(t)=>setServingsPerContainer(Number(t)||1)} keyboardType="decimal-pad" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Text>Serving qty</Text>
                <TextInput value={editServingQuantity} onChangeText={setEditServingQuantity} keyboardType="decimal-pad" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 70, backgroundColor: '#fff' }} />
                <Text>Unit</Text>
                <TextInput value={editServingUnit} onChangeText={setEditServingUnit} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 90, backgroundColor: '#fff' }} />
                <Text>Alt (g/ml)</Text>
                <TextInput value={editServingAltValue} onChangeText={setEditServingAltValue} keyboardType="decimal-pad" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 80, backgroundColor: '#fff' }} />
                <Text>Alt unit</Text>
                <TextInput value={editServingAltUnit} onChangeText={setEditServingAltUnit} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, minWidth: 70, backgroundColor: '#fff' }} />
              </View>
            </ScrollView>
            <Button title="Done" onPress={() => setEditVisible(false)} />
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



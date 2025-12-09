
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Button, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { DetectorBox } from '../services/detector';
import {
  detectAndParseNutrition,
  DetectAndParseResult,
  FieldReading,
} from '../services/detectAndParse';

const CONFIDENCE_THRESHOLD = 0.55;

type FieldState = {
  label: string;
  key: 'calories' | 'protein' | 'servings' | 'servingSize' | 'servingAlt';
  reading?: FieldReading;
};

type NavigationOverrides = {
  autoAdvance: boolean;
  calories?: number;
  protein?: number;
  servings?: number;
  servingQty?: number;
  servingUnit?: string;
  servingAlt?: number;
  servingAltUnit?: string;
};

export default function DetectPreviewScreen({ route, navigation }: any) {
  const { imageUri, price, originalWidth, originalHeight } = route.params ?? {};
  const [boxes, setBoxes] = useState<DetectorBox[]>([]);
  const [result, setResult] = useState<DetectAndParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [container, setContainer] = useState({ width: 1, height: 1 });
  const [calories, setCalories] = useState<string>('');
  const [protein, setProtein] = useState<string>('');
  const [servings, setServings] = useState<string>('');
  const [servingQuantity, setServingQuantity] = useState<string>('');
  const [servingUnit, setServingUnit] = useState<string>('');
  const [servingAlt, setServingAlt] = useState<string>('');
  const [servingAltUnit, setServingAltUnit] = useState<string>('');
  const [previewUri, setPreviewUri] = useState<string | null>(imageUri ?? null);
  const [detectSize, setDetectSize] = useState<{ width: number; height: number }>({ width: originalWidth ?? 1, height: originalHeight ?? 1 });
  const [errors, setErrors] = useState<string[]>([]);
  const autoAdvanceRef = useRef(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const combined = await detectAndParseNutrition(imageUri);
        setResult(combined);
        const { detection } = combined;
        setBoxes(detection.boxes);
        if (detection.processedUri) {
          setPreviewUri(detection.processedUri);
        }
        if (detection.width && detection.height) {
          setDetectSize({ width: detection.width, height: detection.height });
        }
        setErrors(combined.errors ?? []);

        const calorieReading = combined.fields.calories;
        const proteinReading = combined.fields.protein;
        const servingsReading = combined.fields.servingsPerContainer;
        const servingSizeReading = combined.fields.servingSizeQuantityUnit;
        const servingAltReading = combined.fields.servingSizeAltGramsMl;

        if (calorieReading?.numeric?.value != null && calorieReading.combinedConfidence >= CONFIDENCE_THRESHOLD) {
          setCalories(String(calorieReading.numeric.value));
        }
        if (proteinReading?.numeric?.value != null && proteinReading.combinedConfidence >= CONFIDENCE_THRESHOLD) {
          setProtein(String(proteinReading.numeric.value));
        }
        if (servingsReading?.numeric?.value != null && servingsReading.combinedConfidence >= CONFIDENCE_THRESHOLD) {
          setServings(String(servingsReading.numeric.value));
        }
        const servingNumeric: any = servingSizeReading?.numeric;
        if (servingSizeReading && servingNumeric?.quantity != null && servingSizeReading.combinedConfidence >= CONFIDENCE_THRESHOLD) {
          setServingQuantity(String(servingNumeric.quantity));
        }
        const unitText = servingNumeric?.unitText ?? servingNumeric?.unit;
        if (unitText) {
          setServingUnit(unitText);
        }
        if (servingAltReading?.numeric?.value != null && servingAltReading.combinedConfidence >= CONFIDENCE_THRESHOLD) {
          setServingAlt(String(servingAltReading.numeric.value));
        }
        if (servingAltReading?.numeric?.unit) {
          setServingAltUnit(servingAltReading.numeric.unit);
        }
      } catch (e: any) {
        console.warn('detect error', e);
        setErrors([String(e?.message ?? e)]);
      } finally {
        setLoading(false);
      }
    })();
  }, [imageUri]);

  const navigateToResults = useCallback(
    (overrides: NavigationOverrides) => {
      const parsePositive = (value: number | string | undefined) => {
        const num = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(num) && num > 0 ? num : undefined;
      };
      const parseNonNegative = (value: number | string | undefined) => {
        const num = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(num) && num >= 0 ? num : undefined;
      };

      const caloriesValue = parsePositive(overrides.calories ?? calories);
      const proteinValue = parseNonNegative(overrides.protein ?? protein);
      const servingsValue = parsePositive(overrides.servings ?? servings);
      const servingQtyValue = parsePositive(overrides.servingQty ?? servingQuantity);
      const servingUnitValue = ((overrides.servingUnit ?? servingUnit) || '').trim();
      const servingAltValue = parsePositive(overrides.servingAlt ?? servingAlt);
      const servingAltUnitValue = ((overrides.servingAltUnit ?? servingAltUnit) || '').trim();

      const servingSizePayload = servingQtyValue || servingUnitValue
        ? {
            quantity: servingQtyValue,
            unit: servingUnitValue || undefined,
          }
        : undefined;

      const servingAltPayload = servingAltValue || servingAltUnitValue
        ? {
            value: servingAltValue,
            unit: servingAltUnitValue || undefined,
          }
        : undefined;

      navigation.replace('ResultsScreen', {
        imageUri,
        price,
        calories: caloriesValue,
        proteinGrams: proteinValue,
        servingsPerContainer: servingsValue,
        rawText: result?.rawText,
        fieldReadings: result?.order?.map((r) => ({
          className: r.className,
          detectionScore: r.detectionScore,
          parseConfidence: r.parseConfidence,
          combinedConfidence: r.combinedConfidence,
          rawText: r.rawText,
          value: r.numeric?.value,
          unit: (r.numeric as any)?.unitText || r.numeric?.unit,
          cropUri: r.cropUri,
        })),
        servingSize: servingSizePayload,
        servingSizeAlt: servingAltPayload,
        scanId: route.params?.scanId,
        createdAt: route.params?.createdAt,
        autoAdvance: overrides.autoAdvance,
      });
    },
    [calories, protein, servings, servingQuantity, servingUnit, servingAlt, servingAltUnit, imageUri, price, navigation, result, route.params?.scanId, route.params?.createdAt]
  );

  useEffect(() => {
    if (!result || autoAdvanceRef.current) {
      return;
    }
    const caloriesReading = result.fields.calories;
    const proteinReading = result.fields.protein;
    const servingsReading = result.fields.servingsPerContainer;

    const allHighConfidence = [caloriesReading, proteinReading, servingsReading].every((reading) => {
      if (!reading) return false;
      const value = (reading.numeric as any)?.value ?? reading.numeric;
      return value != null && (reading.combinedConfidence ?? 0) >= CONFIDENCE_THRESHOLD;
    });

    if (allHighConfidence) {
      autoAdvanceRef.current = true;
      const servingSizeReading = result.fields.servingSizeQuantityUnit;
      const servingAltReading = result.fields.servingSizeAltGramsMl;
      navigateToResults({
        autoAdvance: true,
        calories: caloriesReading?.numeric?.value,
        protein: proteinReading?.numeric?.value,
        servings: servingsReading?.numeric?.value,
        servingQty: (servingSizeReading?.numeric as any)?.quantity,
        servingUnit: (servingSizeReading?.numeric as any)?.unitText ?? (servingSizeReading?.numeric as any)?.unit,
        servingAlt: servingAltReading?.numeric?.value,
        servingAltUnit: servingAltReading?.numeric?.unit,
      });
    }
  }, [result, navigateToResults]);

  const fieldStates: FieldState[] = useMemo(() => {
    return [
      { label: 'Calories', key: 'calories', reading: result?.fields.calories },
      { label: 'Protein', key: 'protein', reading: result?.fields.protein },
      { label: 'Servings/Container', key: 'servings', reading: result?.fields.servingsPerContainer },
      { label: 'Serving Size', key: 'servingSize', reading: result?.fields.servingSizeQuantityUnit },
      { label: 'Serving Size (g/ml)', key: 'servingAlt', reading: result?.fields.servingSizeAltGramsMl },
    ];
  }, [result]);

  const flaggedKeys = useMemo(() => {
    return new Set(
      fieldStates
        .filter((field) => {
          const reading = field.reading;
          const confidence = reading?.combinedConfidence ?? 0;
          const hasNumeric = reading?.numeric && (reading.numeric as any).value != null;
          const numericValue = (reading?.numeric as any)?.value ?? (reading?.numeric as any)?.quantity ?? reading?.numeric;
          return !reading || numericValue == null || confidence < CONFIDENCE_THRESHOLD;
        })
        .map((field) => field.key)
    );
  }, [fieldStates]);

  const renderBox = (b: DetectorBox) => {
    const imgW = detectSize.width || 1;
    const imgH = detectSize.height || 1;
    const fitScale = Math.min(container.width / imgW, container.height / imgH);
    const offsetX = (container.width - imgW * fitScale) / 2;
    const offsetY = (container.height - imgH * fitScale) / 2;
    const left = offsetX + b.x * fitScale;
    const top = offsetY + b.y * fitScale;
    const width = b.width * fitScale;
    const height = b.height * fitScale;
    const color =
      b.className === 'CaloriesValue'
        ? '#ff3b30'
        : b.className === 'ProteinValue'
        ? '#34c759'
        : b.className === 'ServingsPerContainer'
        ? '#ffcc00'
        : b.className === 'ServingSizeQuantityUnit'
        ? '#007aff'
        : '#af52de';
    return (
      <View key={`${b.className}-${left}-${top}-${width}-${height}`} style={{ position: 'absolute', left, top, width, height, borderColor: color, borderWidth: 2 }} />
    );
  };

  const confidenceLabel = (reading?: FieldReading) => {
    if (!reading) return 'No detection';
    const pct = Math.round(reading.combinedConfidence * 100);
    if (pct >= 80) return `Confident (${pct}%)`;
    if (pct >= 55) return `Medium (${pct}%)`;
    return `Low (${pct}%)`;
  };

  const handleContinue = () => {
    navigateToResults({ autoAdvance: false });
  };

  const needsCalories = flaggedKeys.has('calories');
  const needsProtein = flaggedKeys.has('protein');
  const needsServings = flaggedKeys.has('servings');
  const needsServingSize = flaggedKeys.has('servingSize');
  const needsServingAlt = flaggedKeys.has('servingAlt');

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Text style={{ marginBottom: 8, fontWeight: '600' }}>Detector preview {boxes.length ? `(${boxes.length} boxes)` : ''}</Text>
        <View
          style={{ aspectRatio: 1, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' }}
          onLayout={(e) => setContainer({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          <Image source={{ uri: previewUri ?? imageUri }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} resizeMode="contain" />
          {boxes.map(renderBox)}
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '600', marginBottom: 4, color: '#fff' }}>Auto-recognized fields</Text>
          {fieldStates.map((field) => {
            const reading = field.reading;
            const low = (reading?.combinedConfidence ?? 0) < CONFIDENCE_THRESHOLD;
            return (
              <View
                key={field.key}
                style={{
                  marginBottom: 10,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: low ? '#ff3b30' : '#d1d1d6',
                  borderRadius: 6,
                  backgroundColor: low ? '#fff5f5' : '#f8f9fb',
                }}
              >
                <Text style={{ fontWeight: '500', color: '#111827' }}>{field.label}</Text>
                <Text style={{ fontSize: 12, color: low ? '#ff3b30' : '#6b7280' }}>{confidenceLabel(reading)}</Text>
                <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{reading?.rawText || '—'}</Text>
              </View>
            );
          })}
        </View>

        {errors.length ? (
          <View style={{ marginTop: 8, backgroundColor: '#fff5f5', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ff3b30' }}>
            <Text style={{ color: '#ff3b30', fontWeight: '600' }}>Warnings</Text>
            {errors.map((err, idx) => (
              <Text key={idx} style={{ color: '#ff3b30', fontSize: 12 }}>
                {err}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Text style={{ marginBottom: 4, fontWeight: '600', color: '#fff' }}>Manual review</Text>
          {flaggedKeys.size === 0 ? (
            <Text style={{ fontSize: 12, color: '#d1d5db', marginBottom: 12 }}>All key fields look good. Tap continue if you'd like to review or edit anyway.</Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
            {needsCalories ? (
              <View style={{ flexDirection: 'column', minWidth: '30%' }}>
                <Text style={{ color: '#fff', marginBottom: 4 }}>Calories</Text>
                <TextInput
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="number-pad"
                  placeholder="e.g. 200"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
              </View>
            ) : null}
            {needsProtein ? (
              <View style={{ flexDirection: 'column', minWidth: '30%' }}>
                <Text style={{ color: '#fff', marginBottom: 4 }}>Protein (g)</Text>
                <TextInput
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="number-pad"
                  placeholder="e.g. 8"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
              </View>
            ) : null}
            {needsServings ? (
              <View style={{ flexDirection: 'column', minWidth: '30%' }}>
                <Text style={{ color: '#fff', marginBottom: 4 }}>Servings</Text>
                <TextInput
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 10"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
              </View>
            ) : null}
            {needsServingSize ? (
              <View style={{ flexDirection: 'column', minWidth: '45%' }}>
                <Text style={{ color: '#fff', marginBottom: 4 }}>Serving size qty</Text>
                <TextInput
                  value={servingQuantity}
                  onChangeText={setServingQuantity}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 0.75"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, marginBottom: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
                <Text style={{ color: '#fff', marginBottom: 4 }}>Serving size unit</Text>
                <TextInput
                  value={servingUnit}
                  onChangeText={setServingUnit}
                  placeholder="e.g. cup"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
              </View>
            ) : null}
            {needsServingAlt ? (
              <View style={{ flexDirection: 'column', minWidth: '45%' }}>
                <Text style={{ color: '#fff', marginBottom: 4 }}>Serving size alt (g/ml)</Text>
                <TextInput
                  value={servingAlt}
                  onChangeText={setServingAlt}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 228"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, marginBottom: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
                <Text style={{ color: '#fff', marginBottom: 4 }}>Alt unit</Text>
                <TextInput
                  value={servingAltUnit}
                  onChangeText={setServingAltUnit}
                  placeholder="e.g. g"
                  placeholderTextColor="#9ca3af"
                  style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 4, padding: 6, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' }}
                />
              </View>
            ) : null}
          </View>
          <Button title={loading ? 'Processing…' : 'Continue'} disabled={loading} onPress={handleContinue} />
        </View>
      </ScrollView>
    </View>
  );
}

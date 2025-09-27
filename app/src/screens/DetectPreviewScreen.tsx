import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Button, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { DetectorBox } from '../services/detector';
import {
  detectAndParseNutrition,
  DetectAndParseResult,
  FieldReading,
} from '../services/detectAndParse';

type FieldState = {
  label: string;
  key: 'calories' | 'protein' | 'servings' | 'servingSize' | 'servingAlt';
  reading?: FieldReading;
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const combined = await detectAndParseNutrition(imageUri);
        setResult(combined);
        const { detection } = combined;
        setBoxes(detection.boxes);
        if (detection.meta) {
          console.log('detector meta', detection.meta);
        }
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

        if (calorieReading?.numeric?.value != null && calorieReading.combinedConfidence >= 0.55) {
          setCalories(String(calorieReading.numeric.value));
        }
        if (proteinReading?.numeric?.value != null && proteinReading.combinedConfidence >= 0.55) {
          setProtein(String(proteinReading.numeric.value));
        }
        if (servingsReading?.numeric?.value != null && servingsReading.combinedConfidence >= 0.55) {
          setServings(String(servingsReading.numeric.value));
        }
        const servingSizeReading = combined.fields.servingSizeQuantityUnit;
        if (servingSizeReading?.numeric?.quantity != null && servingSizeReading.combinedConfidence >= 0.55) {
          setServingQuantity(String(servingSizeReading.numeric.quantity));
        }
        const unitText = (servingSizeReading?.numeric as any)?.unitText ?? servingSizeReading?.numeric?.unit;
        if (unitText) {
          setServingUnit(unitText);
        }

        const servingAltReading = combined.fields.servingSizeAltGramsMl;
        if (servingAltReading?.numeric?.value != null && servingAltReading.combinedConfidence >= 0.55) {
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

  const fieldStates: FieldState[] = useMemo(() => {
    return [
      { label: 'Calories', key: 'calories', reading: result?.fields.calories },
      { label: 'Protein', key: 'protein', reading: result?.fields.protein },
      { label: 'Servings/Container', key: 'servings', reading: result?.fields.servingsPerContainer },
      { label: 'Serving Size', key: 'servingSize', reading: result?.fields.servingSizeQuantityUnit },
      { label: 'Serving Size (g/ml)', key: 'servingAlt', reading: result?.fields.servingSizeAltGramsMl },
    ];
  }, [result]);

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

  const handleContinue = () => {
    const calNum = Number(calories);
    const proNum = Number(protein);
    const servNum = Number(servings);
    const servingQtyNum = Number(servingQuantity);
    const servingAltNum = Number(servingAlt);
    const servingSizePayload =
      (isFinite(servingQtyNum) && servingQtyNum > 0) || servingUnit
        ? {
            quantity: isFinite(servingQtyNum) && servingQtyNum > 0 ? servingQtyNum : undefined,
            unit: servingUnit || undefined,
          }
        : undefined;
    const servingAltPayload =
      (isFinite(servingAltNum) && servingAltNum > 0) || servingAltUnit
        ? {
            value: isFinite(servingAltNum) && servingAltNum > 0 ? servingAltNum : undefined,
            unit: servingAltUnit || undefined,
          }
        : undefined;
    navigation.replace('ResultsScreen', {
      imageUri,
      price,
      calories: isFinite(calNum) && calNum > 0 ? calNum : undefined,
      proteinGrams: isFinite(proNum) && proNum >= 0 ? proNum : undefined,
      servingsPerContainer: isFinite(servNum) && servNum > 0 ? servNum : undefined,
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
    });
  };

  const confidenceLabel = (reading?: FieldReading) => {
    if (!reading) return 'No detection';
    const pct = Math.round(reading.combinedConfidence * 100);
    if (pct >= 80) return `Confident (${pct}%)`;
    if (pct >= 55) return `Medium (${pct}%)`;
    return `Low (${pct}%)`;
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Text style={{ marginBottom: 8, fontWeight: '600' }}>Detector preview {boxes.length ? `(${boxes.length} boxes)` : ''}</Text>
        <View style={{ aspectRatio: 1, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' }} onLayout={(e) => setContainer({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          <Image source={{ uri: previewUri ?? imageUri }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} resizeMode="contain" />
          {boxes.map(renderBox)}
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '600', marginBottom: 4 }}>Auto-recognized fields</Text>
          {fieldStates.map((field) => {
            const reading = field.reading;
            const low = (reading?.combinedConfidence ?? 0) < 0.55;
            return (
              <View key={field.key} style={{ marginBottom: 10, padding: 8, borderWidth: 1, borderColor: low ? '#ff3b30' : '#d1d1d6', borderRadius: 6, backgroundColor: low ? '#fff5f5' : '#f8f9fb' }}>
                <Text style={{ fontWeight: '500' }}>{field.label}</Text>
                <Text style={{ fontSize: 12, color: low ? '#ff3b30' : '#8e8e93' }}>{confidenceLabel(reading)}</Text>
                <Text style={{ fontSize: 12, color: '#636366', marginTop: 2 }}>{reading?.rawText || '—'}</Text>
              </View>
            );
          })}
        </View>

        {errors.length ? (
          <View style={{ marginTop: 8, backgroundColor: '#fff5f5', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ff3b30' }}>
            <Text style={{ color: '#ff3b30', fontWeight: '600' }}>Warnings</Text>
            {errors.map((err, idx) => (
              <Text key={idx} style={{ color: '#ff3b30', fontSize: 12 }}>{err}</Text>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Text style={{ marginBottom: 4, fontWeight: '600' }}>Manual review</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <View style={{ flexDirection: 'column', minWidth: '30%' }}>
              <Text>Calories</Text>
              <TextInput value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="e.g. 200" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6 }} />
            </View>
            <View style={{ flexDirection: 'column', minWidth: '30%' }}>
              <Text>Protein (g)</Text>
              <TextInput value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="e.g. 8" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6 }} />
            </View>
            <View style={{ flexDirection: 'column', minWidth: '30%' }}>
              <Text>Servings</Text>
              <TextInput value={servings} onChangeText={setServings} keyboardType="decimal-pad" placeholder="e.g. 15" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6 }} />
            </View>
            <View style={{ flexDirection: 'column', minWidth: '45%' }}>
              <Text>Serving size qty</Text>
              <TextInput value={servingQuantity} onChangeText={setServingQuantity} keyboardType="decimal-pad" placeholder="e.g. 0.75" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, marginBottom: 6 }} />
              <Text>Serving size unit</Text>
              <TextInput value={servingUnit} onChangeText={setServingUnit} placeholder="e.g. cup" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6 }} />
            </View>
            <View style={{ flexDirection: 'column', minWidth: '45%' }}>
              <Text>Serving size alt (g/ml)</Text>
              <TextInput value={servingAlt} onChangeText={setServingAlt} keyboardType="decimal-pad" placeholder="e.g. 228" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6, marginBottom: 6 }} />
              <Text>Alt unit</Text>
              <TextInput value={servingAltUnit} onChangeText={setServingAltUnit} placeholder="e.g. g" style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 6 }} />
            </View>
          </View>
          <Button title={loading ? 'Processing…' : 'Continue'} disabled={loading} onPress={handleContinue} />
        </View>
      </ScrollView>
    </View>
  );
}



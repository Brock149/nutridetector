import React, { useRef, useState } from 'react';
import { View, Image, TouchableOpacity, Text, Button, Alert, PanResponder, ScrollView } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { runOcrAndParse, runOcrTokens } from '../utils/ocr';

type Props = {
  route: any;
  navigation: any;
};

export default function PickCellsScreen({ route, navigation }: Props) {
  const { imageUri, price } = route.params ?? {};
  const [mode, setMode] = useState<'calories' | 'protein'>('calories');
  const [calRect, setCalRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [proRect, setProRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [imageLayout, setImageLayout] = useState({ width: 1, height: 1 });
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [drawFor, setDrawFor] = useState<'calories' | 'protein' | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const panStart = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isPanning,
      onMoveShouldSetPanResponder: () => isPanning,
      onPanResponderGrant: (e, g) => {
        panStart.current = { x: translate.x, y: translate.y };
      },
      onPanResponderMove: (e, g) => {
        if (!isPanning) return;
        setTranslate({ x: panStart.current.x + g.dx, y: panStart.current.y + g.dy });
      },
    })
  ).current;

  const toLogical = (locationX: number, locationY: number) => {
    const baseW = route.params?.originalWidth ?? imageLayout.width;
    const baseH = route.params?.originalHeight ?? imageLayout.height;
    const containerW = imageLayout.width;
    const containerH = imageLayout.height;
    const fitScale = Math.min(containerW / baseW, containerH / baseH);
    const offsetX = (containerW - baseW * fitScale) / 2;
    const offsetY = (containerH - baseH * fitScale) / 2;
    const s = Math.max(0.1, scale);
    // remove user pan/zoom and initial letterboxing offsets
    const x = (locationX - offsetX - translate.x) / (fitScale * s);
    const y = (locationY - offsetY - translate.y) / (fitScale * s);
    // clamp to image bounds
    const lx = Math.max(0, Math.min(baseW, x));
    const ly = Math.max(0, Math.min(baseH, y));
    return { x: lx, y: ly };
  };

  const onImagePress = (evt: any) => {
    if (isPanning) return;
    const { locationX, locationY } = evt.nativeEvent;
    if (!drawFor) return;
    if (!drawStart.current) {
      drawStart.current = { x: locationX, y: locationY };
      if (drawFor === 'calories') setCalRect({ x: locationX, y: locationY, w: 1, h: 1 });
      else setProRect({ x: locationX, y: locationY, w: 1, h: 1 });
    } else {
      const sx = drawStart.current.x; const sy = drawStart.current.y;
      const rect = { x: Math.min(sx, locationX), y: Math.min(sy, locationY), w: Math.abs(locationX - sx), h: Math.abs(locationY - sy) };
      if (drawFor === 'calories') setCalRect(rect); else setProRect(rect);
      drawStart.current = null;
      setDrawFor(null);
    }
  };

  const nextMode = () => {
    if (!calRect || calRect.w < 8 || calRect.h < 8) { Alert.alert('Draw a rectangle over the Calories cell first'); return; }
    setMode('protein');
  };

  const finish = async () => {
    if (!calRect || !proRect) { Alert.alert('Draw both rectangles'); return; }
    try {
      // Convert rectangles to image-space crops
      const baseW = route.params?.originalWidth ?? imageLayout.width;
      const baseH = route.params?.originalHeight ?? imageLayout.height;
      const crops = [
        { key: 'cal', rect: calRect },
        { key: 'pro', rect: proRect },
      ];
      const results: Record<string, any> = {};
      for (const c of crops) {
        if (!c.rect) continue;
        const tl = toLogical(c.rect.x, c.rect.y);
        const br = toLogical(c.rect.x + c.rect.w, c.rect.y + c.rect.h);
        const crop = {
          originX: Math.max(0, tl.x),
          originY: Math.max(0, tl.y),
          width: Math.max(10, br.x - tl.x),
          height: Math.max(10, br.y - tl.y),
        };
        const { uri } = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ crop }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        // Token-level parse: prefer target keywords in ROI
        const tokens = await runOcrTokens(uri);
        let parsed = await runOcrAndParse(uri);
        if (c.key === 'cal') {
          const line = tokens.map(t => t.text).join(' ').toLowerCase();
          const num = (line.match(/\b(\d{2,4})\b/) || [])[1];
          if (num) parsed.calories = Number(num);
        } else {
          const grams = tokens.map(t => t.text).join(' ').match(/\b(\d{1,3})\s*g\b/i);
          if (grams) parsed.proteinGrams = Number(grams[1]);
        }
        results[c.key] = parsed;
      }
      // Fallback to full-image OCR if ROI misses
      let calories = results.cal?.calories;
      let proteinGrams = results.pro?.proteinGrams;
      let servingsPerContainer = results.cal?.servingsPerContainer ?? results.pro?.servingsPerContainer;
      if (calories == null || proteinGrams == null || servingsPerContainer == null) {
        const full = await runOcrAndParse(imageUri);
        if (calories == null && full.calories != null) calories = full.calories;
        if (proteinGrams == null && full.proteinGrams != null) proteinGrams = full.proteinGrams;
        if (servingsPerContainer == null && full.servingsPerContainer != null) servingsPerContainer = full.servingsPerContainer;
        results.full = full;
      }
      calories = calories ?? 0;
      proteinGrams = proteinGrams ?? 0;
      servingsPerContainer = servingsPerContainer ?? 1;

      navigation.replace('ResultsScreen', {
        imageUri,
        price,
        calories,
        proteinGrams,
        servingsPerContainer,
        rawText: `calROI: ${JSON.stringify(results.cal)}\nproROI: ${JSON.stringify(results.pro)}\nfull: ${JSON.stringify(results.full)}`,
      });
    } catch (e) {
      Alert.alert('Failed to read selection', String(e));
    }
  };

  const renderRect = (rect: {x:number;y:number;w:number;h:number}|null, color: string) => rect ? (
    <View pointerEvents="none" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderWidth: 2, borderColor: color }} />
  ) : null;

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Text style={{ marginBottom: 8 }}>Draw rectangles: {mode === 'calories' ? 'Calories' : 'Protein (g)'} (press Draw buttons)</Text>
      <View
        onLayout={(e) => setImageLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onImagePress}
          {...panResponder.panHandlers}
          style={{ width: '100%', aspectRatio: 1, backgroundColor: '#000', overflow: 'hidden' }}
        >
          <Image
            source={{ uri: imageUri }}
            resizeMode="contain"
            style={{ width: '100%', height: '100%', transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }] }}
          />
          {renderRect(calRect, '#ff3b30')}
          {renderRect(proRect, '#34c759')}
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 8 }}>
          <Button title={isPanning ? 'Select' : 'Pan'} onPress={() => setIsPanning(v => !v)} />
          <Button title="-" onPress={() => setScale(s => Math.max(1, Number((s - 0.25).toFixed(2))))} />
          <Button title="+" onPress={() => setScale(s => Math.min(4, Number((s + 0.25).toFixed(2))))} />
          <Button title="Center" onPress={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }} />
          <Button title="Draw Cal" onPress={() => setDrawFor('calories')} />
          <Button title="Draw Pro" onPress={() => setDrawFor('protein')} />
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Button title="Next" onPress={nextMode} />
          <Button title="Finish" onPress={finish} />
        </View>
      </View>
    </View>
  );
}



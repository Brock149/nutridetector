import * as ImageManipulator from 'expo-image-manipulator';
import MlkitOcr from 'react-native-mlkit-ocr';

import {
  detectFieldsOnImage,
  DetectorBox,
  DetectorClassName,
  DetectorResult,
} from './detector';
import { normalizeNumericArtifacts } from '../utils/ocr';

type NumericParse = {
  value?: number;
  unit?: string;
  confidence: number; // 0..1 (OCR parsing confidence)
  reasons?: string[];
};

type ServingSizeParse = NumericParse & {
  quantity?: number;
  unitText?: string;
};

export type FieldReading = {
  className: DetectorClassName;
  box: DetectorBox;
  cropUri?: string;
  rawText?: string;
  detectionScore: number;
  parseConfidence: number;
  combinedConfidence: number;
  numeric?: NumericParse | ServingSizeParse;
  error?: string;
};

export type DetectAndParseResult = {
  detection: DetectorResult;
  fields: {
    calories?: FieldReading;
    protein?: FieldReading;
    servingsPerContainer?: FieldReading;
    servingSizeQuantityUnit?: FieldReading;
    servingSizeAltGramsMl?: FieldReading;
  };
  order: FieldReading[];
  rawText?: string;
  errors?: string[];
};

type CropParams = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

const FIELD_SEQUENCE: { key: keyof DetectAndParseResult['fields']; className: DetectorClassName }[] = [
  { key: 'calories', className: 'CaloriesValue' },
  { key: 'protein', className: 'ProteinValue' },
  { key: 'servingsPerContainer', className: 'ServingsPerContainer' },
  { key: 'servingSizeQuantityUnit', className: 'ServingSizeQuantityUnit' },
  { key: 'servingSizeAltGramsMl', className: 'ServingSizeAltGramsMl' },
];

function clampCrop(origin: number, size: number, max: number): number {
  const clamped = Math.max(0, Math.min(origin, max));
  if (clamped + size > max) {
    return Math.max(0, max - size);
  }
  return clamped;
}

function normalizeValueToken(token: string): number | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;

  // Mixed number e.g., "1 1/2"
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (isFinite(whole) && isFinite(num) && isFinite(den) && den !== 0) {
      return whole + num / den;
    }
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (isFinite(num) && isFinite(den) && den !== 0) {
      return num / den;
    }
  }

  const numeric = Number(trimmed);
  if (isFinite(numeric)) {
    return numeric;
  }

  return undefined;
}

function pickBest(numbers: number[], predicate: (n: number) => boolean, prefer: 'max' | 'min' | 'closestZero' = 'max'): number | undefined {
  const filtered = numbers.filter(predicate);
  if (!filtered.length) return undefined;
  if (prefer === 'min') return Math.min(...filtered);
  if (prefer === 'closestZero') {
    let best = filtered[0];
    let bestAbs = Math.abs(best);
    for (const value of filtered) {
      const abs = Math.abs(value);
      if (abs < bestAbs) {
        best = value;
        bestAbs = abs;
      }
    }
    return best;
  }
  return Math.max(...filtered);
}

function parseCalories(raw: string): NumericParse {
  const normalized = normalizeNumericArtifacts(raw || '').replace(/[,\s]+/g, ' ');
  const matches = Array.from(normalized.matchAll(/\b(\d{2,4})\b/g)).map((m) => Number(m[1]));
  const value = pickBest(matches, (n) => n >= 40 && n <= 1500, 'max');
  return {
    value,
    confidence: value != null ? 0.9 : 0.35,
    reasons: value != null ? ['numeric-match'] : undefined,
  };
}

function parseProtein(raw: string): NumericParse {
  const normalized = normalizeNumericArtifacts(raw || '').replace(/[,\s]+/g, ' ');
  const matches = Array.from(normalized.matchAll(/\b(\d{1,3})(?:\s*g)?\b/gi)).map((m) => Number(m[1]));
  const value = pickBest(matches, (n) => n >= 0 && n <= 200, 'max');
  const hasUnit = /\b[gG]\b/.test(normalized);
  const confidence = value != null ? (hasUnit ? 0.92 : 0.75) : 0.3;
  return {
    value,
    confidence,
    reasons: value != null ? ['numeric-match', hasUnit ? 'unit-g' : 'no-unit'] : undefined,
  };
}

function parseServingsPerContainer(raw: string): NumericParse {
  const normalized = normalizeNumericArtifacts(raw || '').replace(/[,]+/g, '.');
  const matches = Array.from(normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g)).map((m) => Number(m[1]));
  const value = pickBest(matches, (n) => n > 0 && n <= 500, 'max');
  const about = /about/gi.test(normalized);
  const confidence = value != null ? (about ? 0.55 : 0.8) : 0.3;
  return {
    value,
    confidence,
    reasons: value != null ? ['numeric-match', about ? 'about-modifier' : 'exact'] : undefined,
  };
}

const SERVING_UNITS = [
  'cup',
  'cups',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'teaspoon',
  'teaspoons',
  'oz',
  'ounce',
  'ounces',
  'g',
  'gram',
  'grams',
  'ml',
  'milliliter',
  'milliliters',
  'piece',
  'pieces',
  'nugget',
  'nuggets',
  'slice',
  'slices',
  'link',
  'links',
  'bar',
  'bars',
  'serving',
  'servings',
];

function parseServingSizeQuantity(raw: string): ServingSizeParse {
  const normalized = normalizeNumericArtifacts(raw || '').replace(/[,]+/g, '.');
  let value: number | undefined;
  let unitText: string | undefined;
  let matchedUnit: string | undefined;

  // Try to capture patterns like "2/3 cup" or "1 1/2 cups"
  const mixedMatch = normalized.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
  if (mixedMatch) {
    value = normalizeValueToken(mixedMatch[1]);
    unitText = mixedMatch[2].trim();
  }

  if (!value) {
    const numberFirst = normalized.match(/(\d+(?:\.\d+)?)\s*(.*)/);
    if (numberFirst) {
      value = Number(numberFirst[1]);
      unitText = (numberFirst[2] || '').trim();
    }
  }

  if (unitText) {
    const lower = unitText.toLowerCase();
    matchedUnit = SERVING_UNITS.find((u) => lower.startsWith(u));
  }

  const confidence = value != null ? (matchedUnit ? 0.85 : 0.6) : 0.25;

  return {
    value,
    quantity: value,
    unit: matchedUnit,
    unitText,
    confidence,
    reasons: value != null ? ['quantity-detected', matchedUnit ? 'unit-known' : 'unit-unknown'] : undefined,
  };
}

function parseServingSizeAlt(raw: string): NumericParse {
  const normalized = normalizeNumericArtifacts(raw || '').replace(/[,]+/g, '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(g|grams?|ml|milliliters?|oz|ounces?)/i);
  if (match) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (isFinite(value)) {
      return {
        value,
        unit,
        confidence: 0.88,
        reasons: ['value-with-unit'],
      };
    }
  }

  const fallback = normalized.match(/(\d+(?:\.\d+)?)/);
  if (fallback) {
    const value = Number(fallback[1]);
    return {
      value,
      confidence: 0.5,
      reasons: ['value-no-unit'],
    };
  }

  return { confidence: 0.2 };
}

function combineConfidence(detectionScore: number, parseConfidence: number): number {
  const combined = detectionScore * 0.65 + parseConfidence * 0.35;
  return Math.max(0, Math.min(1, combined));
}

async function cropBox(
  uri: string,
  box: DetectorBox,
  imageWidth: number,
  imageHeight: number,
  padding = 12
): Promise<{ uri: string; crop: CropParams } | undefined> {
  const originX = clampCrop(Math.floor(box.x - padding), Math.ceil(box.width + padding * 2), imageWidth);
  const originY = clampCrop(Math.floor(box.y - padding), Math.ceil(box.height + padding * 2), imageHeight);
  const width = Math.min(imageWidth - originX, Math.ceil(box.width + padding * 2));
  const height = Math.min(imageHeight - originY, Math.ceil(box.height + padding * 2));

  if (width <= 1 || height <= 1) {
    return undefined;
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        crop: {
          originX,
          originY,
          width,
          height,
        },
      },
    ],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
  );

  if (!result?.uri) return undefined;
  return {
    uri: result.uri,
    crop: {
      originX,
      originY,
      width,
      height,
    },
  };
}

export async function detectAndParseNutrition(imageUri: string): Promise<DetectAndParseResult> {
  const detection = await detectFieldsOnImage(imageUri);
  const sourceUri = detection.processedUri ?? imageUri;
  const errors: string[] = [];

  const topByClass = new Map<DetectorClassName, DetectorBox>();
  const sortedBoxes = [...detection.boxes].sort((a, b) => b.score - a.score);
  for (const box of sortedBoxes) {
    if (!topByClass.has(box.className)) {
      topByClass.set(box.className, box);
    }
  }

  const order: FieldReading[] = [];

  for (const { key, className } of FIELD_SEQUENCE) {
    const box = topByClass.get(className);
    if (!box) {
      continue;
    }

    let cropResult: { uri: string; crop: CropParams } | undefined;
    let rawText: string | undefined;
    let parseResult: NumericParse | ServingSizeParse | undefined;
    let parseConfidence = 0.2;
    let error: string | undefined;

    try {
      cropResult = await cropBox(sourceUri, box, detection.width || 640, detection.height || 640, 18);
      if (!cropResult) {
        throw new Error('crop-failed');
      }

      const blocks: { text?: string }[] = await MlkitOcr.detectFromUri(cropResult.uri);
      rawText = blocks.map((b) => (b.text ?? '').trim()).filter(Boolean).join('\n');

      switch (className) {
        case 'CaloriesValue':
          parseResult = parseCalories(rawText);
          break;
        case 'ProteinValue':
          parseResult = parseProtein(rawText);
          break;
        case 'ServingsPerContainer':
          parseResult = parseServingsPerContainer(rawText);
          break;
        case 'ServingSizeQuantityUnit':
          parseResult = parseServingSizeQuantity(rawText);
          break;
        case 'ServingSizeAltGramsMl':
          parseResult = parseServingSizeAlt(rawText);
          break;
        default:
          parseResult = { confidence: 0.3 };
          break;
      }

      parseConfidence = parseResult?.confidence ?? 0.2;
    } catch (err: any) {
      error = typeof err?.message === 'string' ? err.message : String(err);
      errors.push(`${className}:${error}`);
    }

    const combinedConfidence = combineConfidence(box.score ?? 0, parseConfidence);

    const reading: FieldReading = {
      className,
      box,
      cropUri: cropResult?.uri,
      rawText,
      detectionScore: box.score ?? 0,
      parseConfidence,
      combinedConfidence,
      numeric: parseResult,
      error,
    };

    order.push(reading);
  }

  const fields: DetectAndParseResult['fields'] = {};
  for (const reading of order) {
    const { className } = reading;
    if (className === 'CaloriesValue') fields.calories = reading;
    if (className === 'ProteinValue') fields.protein = reading;
    if (className === 'ServingsPerContainer') fields.servingsPerContainer = reading;
    if (className === 'ServingSizeQuantityUnit') fields.servingSizeQuantityUnit = reading;
    if (className === 'ServingSizeAltGramsMl') fields.servingSizeAltGramsMl = reading;
  }

  const rawText = order
    .map((item) => `${item.className}: ${item.rawText ?? ''}`.trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    detection,
    fields,
    order,
    rawText: rawText.length ? rawText : undefined,
    errors: errors.length ? errors : undefined,
  };
}



import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { toByteArray as base64ToBytes } from 'base64-js';

export type DetectorClassName =
  | 'CaloriesValue'
  | 'ProteinValue'
  | 'ServingsPerContainer'
  | 'ServingSizeQuantityUnit'
  | 'ServingSizeAltGramsMl';

export type DetectorBox = {
  className: DetectorClassName;
  score: number; // 0..1
  // absolute image-space coords (px)
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectorResult = {
  boxes: DetectorBox[];
  width: number;
  height: number;
  meta?: string;
  processedUri?: string;
};

// Use Metro-bundled asset via require(..) per library docs
const MODEL_REQUIRE: number = require('../../assets/models/nutri-detector-int8.tflite');

let cachedModel: TensorflowModel | null = null;
// Nuclear option: require NMS outputs; skip raw YOLO decoding to keep UX stable
const NMS_ONLY = true;
async function ensureModelLoaded(): Promise<TensorflowModel> {
  if (cachedModel) return cachedModel;
  // Use default CPU delegate for widest compatibility; we can switch to 'nnapi' later
  cachedModel = await loadTensorflowModel(MODEL_REQUIRE);
  return cachedModel;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function iou(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interA = interW * interH;
  const aA = a.width * a.height;
  const bA = b.width * b.height;
  const union = aA + bA - interA;
  return union <= 0 ? 0 : interA / union;
}

function safeJson(value: any): string {
  try {
    return JSON.stringify(value);
  } catch (e) {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

function isTypedArray(value: any): value is ArrayBufferView {
  return (
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof Float32Array ||
    value instanceof Float64Array
  );
}

const CLASS_NAMES: DetectorClassName[] = [
  'CaloriesValue',
  'ProteinValue',
  'ServingsPerContainer',
  'ServingSizeQuantityUnit',
  'ServingSizeAltGramsMl',
];

export async function detectFieldsOnImage(uri: string): Promise<DetectorResult> {
  const debugLogs: string[] = [];
  const pushLog = (msg: string) => {
    if (debugLogs.length < 60) debugLogs.push(msg);
  };

  let processedUri: string | undefined;

  try {
    pushLog('detect:start');
    const model = await ensureModelLoaded();
    pushLog(`model:inputs=${safeJson(model.inputs)} outputs=${safeJson(model.outputs)}`);

    const SIZE = 640;
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: SIZE, height: SIZE } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    processedUri = manipulated.uri;
    if (!manipulated.base64) {
      return { boxes: [], width: SIZE, height: SIZE, meta: 'no-base64', processedUri };
    }

    const jpegBytes = base64ToBytes(manipulated.base64);
    const decoded = decodeJpeg(jpegBytes, { useTArray: true });
    if (!decoded || !decoded.data) {
      return { boxes: [], width: SIZE, height: SIZE, meta: 'jpeg-decode-failed', processedUri };
    }

    const rgba = decoded.data;
    const inputInfo = model.inputs[0];
    pushLog(`input dtype=${inputInfo.dataType}`);
    let inputTensor: Float32Array | Int8Array | Uint8Array;

    if (inputInfo.dataType === 'float32') {
      const arr = new Float32Array(SIZE * SIZE * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        arr[j++] = rgba[i] / 255;
        arr[j++] = rgba[i + 1] / 255;
        arr[j++] = rgba[i + 2] / 255;
      }
      inputTensor = arr;
    } else if (inputInfo.dataType === 'int8') {
      const arr = new Int8Array(SIZE * SIZE * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        arr[j++] = (rgba[i] - 128) as number as any;
        arr[j++] = (rgba[i + 1] - 128) as number as any;
        arr[j++] = (rgba[i + 2] - 128) as number as any;
      }
      inputTensor = arr;
    } else {
      const arr = new Uint8Array(SIZE * SIZE * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        arr[j++] = rgba[i];
        arr[j++] = rgba[i + 1];
        arr[j++] = rgba[i + 2];
      }
      inputTensor = arr;
    }
    pushLog(`input tensor ctor=${inputTensor.constructor.name}`);
    pushLog(`input dims=${safeJson(inputInfo.shape)} len=${inputTensor.length}`);

    pushLog('running model');
    let outputsRaw: any;
    const invoke = () => model.runSync([inputTensor]);
    try {
      outputsRaw = invoke();
    } catch (err: any) {
      pushLog(`runSync error=${err?.message ?? String(err)}`);
      try {
        outputsRaw = await model.run([inputTensor]);
        pushLog('fallback to async run succeeded');
      } catch (err2: any) {
        pushLog(`run async error=${err2?.message ?? String(err2)}`);
        throw err;
      }
    }

    const outputsArray = Array.isArray(outputsRaw) ? outputsRaw : [outputsRaw];
    pushLog(`outputs count=${outputsArray.length}`);

    const tensors = outputsArray.map((tensor, idx) => {
      if (isTypedArray(tensor)) {
        pushLog(`tensor[${idx}] len=${tensor.length}`);
        return tensor as ArrayBufferView;
      }
      if (tensor && typeof tensor === 'object') {
        if (isTypedArray((tensor as any).data)) {
          const typed = (tensor as any).data as ArrayBufferView;
          pushLog(`tensor[${idx}] data len=${typed.length}`);
          return typed;
        }
        if ((tensor as any).buffer && typeof (tensor as any).buffer.byteLength === 'number') {
          const typed = new Float32Array((tensor as any).buffer);
          pushLog(`tensor[${idx}] buffer len=${typed.length}`);
          return typed;
        }
      }
      const msg = `Unsupported tensor output at index ${idx}`;
      pushLog(msg);
      throw new Error(msg);
    });

    const outputShape = model.outputs?.[0]?.shape ?? [];
    const out0 = tensors[0] as ArrayBufferView | undefined;
    const out0Len = out0?.length ?? 0;
    pushLog(`out0 shape=${safeJson(outputShape)} len=${out0Len}`);

    if (out0 && outputShape.length === 3 && outputShape[2] === 6 && out0Len >= 6) {
      pushLog('using fused nms output');

      const arr = out0 instanceof Float32Array ? out0 : new Float32Array(out0.buffer);
      const rows = outputShape[1] ?? out0Len / 6;
      const AREA_MIN = 0.0002;
      const AREA_MAX = 0.15;
      const sampleRows: string[] = [];
      for (let i = 0; i < Math.min(rows, 15); i++) {
        const off = i * 6;
        sampleRows.push(
          `[${arr[off + 0].toFixed(3)}, ${arr[off + 1].toFixed(3)}, ${arr[off + 2].toFixed(3)}, ${arr[off + 3].toFixed(3)}, score=${arr[off + 4].toFixed(3)}, cls=${arr[off + 5].toFixed(3)}]`
        );
      }
      pushLog(`fused rows sample=${sampleRows.join('; ')}`);

      const makeBoxes = (variant: 'xyxy' | 'yxxy' | 'xywh'): DetectorBox[] => {
        const boxes: DetectorBox[] = [];
        for (let i = 0; i < rows; i++) {
          const off = i * 6;
          const raw0 = arr[off + 0];
          const raw1 = arr[off + 1];
          const raw2 = arr[off + 2];
          const raw3 = arr[off + 3];
          const score = arr[off + 4];
          const clsIndex = Math.round(arr[off + 5]) | 0;
          if (score < 0.05 || clsIndex < 0 || clsIndex >= CLASS_NAMES.length) continue;

          let xmin: number;
          let ymin: number;
          let xmax: number;
          let ymax: number;

          if (variant === 'xywh') {
            const normalized = Math.max(Math.abs(raw0), Math.abs(raw1), Math.abs(raw2), Math.abs(raw3)) <= 1.5;
            const cx = normalized ? raw0 * SIZE : raw0;
            const cy = normalized ? raw1 * SIZE : raw1;
            const w = Math.max(1, (normalized ? Math.abs(raw2) * SIZE : Math.abs(raw2)));
            const h = Math.max(1, (normalized ? Math.abs(raw3) * SIZE : Math.abs(raw3)));
            xmin = cx - w / 2;
            xmax = cx + w / 2;
            ymin = cy - h / 2;
            ymax = cy + h / 2;
          } else {
            const normalized = Math.max(raw0, raw1, raw2, raw3) <= 1.5 && Math.min(raw0, raw1, raw2, raw3) >= -0.2;
            if (variant === 'xyxy') {
              xmin = normalized ? raw0 * SIZE : raw0;
              ymin = normalized ? raw1 * SIZE : raw1;
              xmax = normalized ? raw2 * SIZE : raw2;
              ymax = normalized ? raw3 * SIZE : raw3;
            } else {
              ymin = normalized ? raw0 * SIZE : raw0;
              xmin = normalized ? raw1 * SIZE : raw1;
              ymax = normalized ? raw2 * SIZE : raw2;
              xmax = normalized ? raw3 * SIZE : raw3;
            }
          }

          const width = Math.max(1, xmax - xmin);
          const height = Math.max(1, ymax - ymin);
          const x = Math.max(0, Math.min(SIZE - width, xmin));
          const y = Math.max(0, Math.min(SIZE - height, ymin));
          const areaRatio = (width * height) / (SIZE * SIZE);
          if (areaRatio < AREA_MIN || areaRatio > AREA_MAX) continue;

          boxes.push({
            className: CLASS_NAMES[clsIndex],
            score,
            x,
            y,
            width,
            height,
          });
        }
        return boxes;
      };

      const variants: ('xyxy' | 'yxxy' | 'xywh')[] = ['xyxy', 'yxxy', 'xywh'];
      const candidates = variants.map((variant) => {
        const boxes = makeBoxes(variant);
        let score = 0;
        let clustered = 0;
        if (boxes.length > 0) {
          for (const box of boxes) {
            const cxNorm = (box.x + box.width * 0.5) / SIZE;
            const cyNorm = (box.y + box.height * 0.5) / SIZE;
            const areaRatio = (box.width * box.height) / (SIZE * SIZE);
            const centerScore = Math.max(0, 1 - Math.abs(cxNorm - 0.5) * 2) * Math.max(0, 1 - Math.abs(cyNorm - 0.5) * 2);
            const aspect = Math.min(box.width, box.height) / Math.max(box.width, box.height);
            if (cxNorm < 0.3 && cyNorm < 0.3) clustered++;
            const areaPenalty = Math.max(0, areaRatio - 0.07);
            score += (centerScore * 0.45 + aspect * 0.2 - areaPenalty * 1.0) * box.score;
          }
          score /= boxes.length;
        }
        const clusterRatio = boxes.length ? clustered / boxes.length : 1;
        return { variant, boxes, score: score - clusterRatio * 0.7, clusterRatio };
      });

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const topByClass: Partial<Record<DetectorClassName, DetectorBox>> = {};
      for (const box of best.boxes) {
        const prev = topByClass[box.className];
        if (!prev || box.score > prev.score) {
          topByClass[box.className] = box;
        }
      }
      const finalBoxes = Object.values(topByClass);
      const presentClasses = finalBoxes.map((b) => b.className);
      pushLog(`classes present=${safeJson(presentClasses)}`);
      const preview = finalBoxes.map((b) => ({
        c: b.className,
        x: Number((b.x / SIZE).toFixed(3)),
        y: Number((b.y / SIZE).toFixed(3)),
        w: Number((b.width / SIZE).toFixed(3)),
        h: Number((b.height / SIZE).toFixed(3)),
        s: Number(b.score.toFixed(3)),
      }));
      const meta = `used=rows6-nms variant=${best.variant} scores=${safeJson(candidates.map((c) => ({ v: c.variant, score: Number(c.score.toFixed(3)), count: c.boxes.length, cluster: Number(c.clusterRatio.toFixed(3)) })))} preview=${safeJson(preview)} len=${out0Len}`;
      return { boxes: finalBoxes, width: SIZE, height: SIZE, meta, processedUri };
    }

    const meta = `unsupported-output shape=${safeJson(outputShape)} len=${out0Len} logs=${safeJson(debugLogs)}`;
    return { boxes: [], width: SIZE, height: SIZE, meta, processedUri };
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : String(e);
    const final = `exception:${msg} logs=${safeJson(debugLogs)} stack=${safeJson(e?.stack ?? '')}`;
    return { boxes: [], width: 0, height: 0, meta: final, processedUri };
  }
}



import MlkitOcr from 'react-native-mlkit-ocr';

export type ParsedNutrition = {
  calories?: number;
  proteinGrams?: number;
  servingsPerContainer?: number;
  confidence: number;
  rawText: string;
};

type Box = { x: number; y: number; width: number; height: number };
type Block = { text: string; bounding?: Partial<Box> };

function getBox(b: Block): Box {
  const x = (b.bounding?.x ?? (b as any).left ?? 0) as number;
  const y = (b.bounding?.y ?? (b as any).top ?? 0) as number;
  const width = (b.bounding?.width ?? (b as any).width ?? 0) as number;
  const height = (b.bounding?.height ?? (b as any).height ?? 0) as number;
  return { x, y, width, height };
}

function centerY(box: Box): number { return box.y + box.height / 2; }
function centerX(box: Box): number { return box.x + box.width / 2; }
function right(box: Box): number { return box.x + box.width; }

function extractNumbers(s: string): number[] {
  return Array.from(s.matchAll(/\b(\d{1,4})\b/g)).map(m => Number(m[1]));
}

// Normalize common OCR confusions in numeric contexts (universal across metrics)
export function normalizeNumericArtifacts(input: string): string {
  let s = input;
  // Replace letter O between digits, or before units/percent, with zero
  s = s.replace(/(\d)\s*[oO]\s*(\d)/g, '$1 0 $2');
  s = s.replace(/(\d)\s*[oO]\s*(mg|mcg|g|%)/gi, '$1 0 $2');
  s = s.replace(/\b[oO]\s*(mg|mcg|g|%)/gi, '0 $1');
  s = s.replace(/\b[oO]\s*(\d)/g, '0 $1');

  // 1/I/l → 1 when adjacent to digits
  s = s.replace(/(\d)\s*[lI]\s*(\d)/g, '$1 1 $2');

  // S ↔ 5 when adjacent to digits
  s = s.replace(/(\d)\s*[sS]\s*(\d)/g, '$1 5 $2');

  // Unit typos
  s = s.replace(/mng/gi, 'mg');

  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, ' ');
  return s;
}

// Region helper used for deterministic cell picking
type Rect = { left: number; right: number; top: number; bottom: number };
function rectOfRowCell(labelBox: Box, splitX?: number, padX = 8, padY = 6): Rect {
  const left = right(labelBox) + padX;
  const rightEdge = splitX != null ? splitX - padX : right(labelBox) + labelBox.width * 4;
  const top = labelBox.y - Math.max(padY, labelBox.height * 0.4);
  const bottom = labelBox.y + labelBox.height + Math.max(padY, labelBox.height * 0.6);
  return { left, right: rightEdge, top, bottom };
}
function blocksInRect(bs: Block[], r: Rect): Block[] {
  return bs.filter(b => {
    const bb = getBox(b);
    const cx = centerX(bb);
    const cy = centerY(bb);
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  });
}
function pickNumberFromBlocks(bs: Block[], { gramsOnly = false }: { gramsOnly?: boolean } = {}): number | undefined {
  let bestNum: number | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const b of bs) {
    const tRaw = (b.text || '').trim();
    const t = normalizeNumericArtifacts(tRaw);
    if (/less\s+than/i.test(t)) continue;
    if (/%/.test(t)) continue;
    if (/mg\b/i.test(t)) continue;
    if (gramsOnly && !/g\b/i.test(t) && !/\b\d{1,3}\b/.test(t)) continue;
    const m = gramsOnly
      ? t.match(/\b(\d{1,3})\s*g\b/i) || t.match(/\b(\d{1,3})\b/)
      : t.match(/\b(\d{2,4})\b/);
    if (!m) continue;
    const val = Number(m[1]);
    if (!isFinite(val)) continue;
    // score favors explicit unit and larger font boxes
    const score = (/g\b/i.test(t) ? -2 : 0) + (-getBox(b).height);
    if (bestNum == null || score < bestScore) {
      bestNum = val;
      bestScore = score;
    }
  }
  return bestNum;
}

function findServingColumnX(rowGroups: { y: number; tokens: { text: string; x: number }[] }[]): number | undefined {
  // 1) Header-based
  for (const row of rowGroups) {
    const t = row.tokens.map(t => t.text).join(' ').toLowerCase();
    const perServ = row.tokens.find(tk => /per\s*serving/i.test(tk.text));
    const perCup = row.tokens.find(tk => /per\s*1\s*cup|per\s*cup/i.test(tk.text));
    if (t.includes('per serving') && (t.includes('per 1 cup') || t.includes('per cup')) && perServ && perCup) {
      return perServ.x; // use header center for column X
    }
  }
  // 2) Calories row numbers
  const calRow = rowGroups.find(r => r.tokens.some(t => /calories/i.test(t.text)));
  if (calRow) {
    const nums = calRow.tokens.filter(t => /^\d{2,4}$/.test(t.text)).sort((a,b)=>a.x-b.x);
    if (nums.length >= 1) return nums[0].x;
  }
  return undefined;
}

function pickNumberNearX(blocks: Block[], rowY: number, targetX: number, rowTol: number, gramsOnly = false): number | undefined {
  const cands = blocks.filter(b => Math.abs(centerY(getBox(b)) - rowY) <= rowTol);
  let best: { val: number; dx: number; unit: boolean } | undefined;
  for (const b of cands) {
    const text = normalizeNumericArtifacts(b.text || '');
    if (/less\s+than/i.test(text)) continue;
    if (/[%]/.test(text)) continue;
    if (/mg\b/i.test(text)) continue;
    const m = gramsOnly ? (text.match(/\b(\d{1,3})\s*g\b/i) || text.match(/\b(\d{1,3})\b/)) : text.match(/\b(\d{2,4})\b/);
    if (!m) continue;
    const val = Number(m[1]);
    if (!isFinite(val)) continue;
    const dx = Math.abs(centerX(getBox(b)) - targetX);
    const unit = /g\b/i.test(text);
    const score = { val, dx, unit };
    if (!best || dx < best.dx || (dx === best.dx && (unit && !best.unit))) best = score;
  }
  return best?.val;
}

export async function runOcrAndParse(uri: string): Promise<ParsedNutrition> {
  const blocks: Block[] = await MlkitOcr.detectFromUri(uri) as any;
  // Build a left-to-right reading order using bounding boxes for better debug readability
  // 1) Restrict to Nutrition Facts panel region when possible
  let panelBlocks: Block[] = blocks as Block[];
  try {
    const nf = (blocks as Block[]).find(b => /nutrition\s*facts/i.test(b.text || ''));
    if (nf) {
      const bx = getBox(nf);
      const left = bx.x - Math.max(8, bx.width * 0.15);
      const rightBound = bx.x + Math.max(bx.width * 3.2, bx.width + 420);
      const top = bx.y - Math.max(6, bx.height * 0.5);
      const bottom = bx.y + Math.max(bx.height * 18, 1400);
      panelBlocks = (blocks as Block[]).filter(b => {
        const r = getBox(b);
        const cx = centerX(r);
        const cy = centerY(r);
        return cx >= left && cx <= rightBound && cy >= top && cy <= bottom;
      });
    }
  } catch {}

  const items = (panelBlocks as Block[])
    .map((b) => ({ text: (b.text || '').trim(), box: getBox(b) }))
    .filter((i) => i.text.length > 0);

  // Sort by row (centerY), then by x
  items.sort((a, b) => {
    const dy = centerY(a.box) - centerY(b.box);
    if (Math.abs(dy) > 12) return dy;
    return a.box.x - b.box.x;
  });

  // Group into rows, keep token positions for column selection
  const rows: { y: number; parts: string[] }[] = [];
  const rowGroups: { y: number; tokens: { text: string; x: number }[] }[] = [];
  const rowTol = 14; // pixels; heuristic
  for (const it of items) {
    const cy = centerY(it.box);
    const cx = centerX(it.box);
    const last = rows[rows.length - 1];
    if (last && Math.abs(cy - last.y) <= rowTol) {
      last.parts.push(it.text);
      rowGroups[rowGroups.length - 1].tokens.push({ text: it.text, x: cx });
      // keep average center
      last.y = (last.y * (last.parts.length - 1) + cy) / last.parts.length;
      rowGroups[rowGroups.length - 1].y = (rowGroups[rowGroups.length - 1].y + cy) / 2;
    } else {
      rows.push({ y: cy, parts: [it.text] });
      rowGroups.push({ y: cy, tokens: [{ text: it.text, x: cx }] });
    }
  }

  const orderedText = rows.map((r) => r.parts.join(' ')).join('\n');
  const rawText = orderedText;

  // Improved heuristics (US FDA label):
  // - Work per line to avoid matching Calcium/Percent lines
  // - Prefer numbers on a line that includes 'calories' but NOT 'calcium'/'kcal'
  // - Ignore units and % lines
  const normalizedText = normalizeNumericArtifacts(rawText);
  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Determine splitX for left (per serving) vs right column
  let splitX: number | undefined;
  try {
    // Look for explicit headers in rowGroups
    for (const row of rowGroups) {
      const joined = row.tokens.map(t => t.text).join(' ').toLowerCase();
      if (joined.includes('per serving') && (joined.includes('per 1 cup') || joined.includes('per cup'))) {
        const perServ = row.tokens.filter(t => /per\s*serving/i.test(t.text));
        const perCup = row.tokens.filter(t => /per\s*1\s*cup|per\s*cup/i.test(t.text));
        if (perServ.length && perCup.length) {
          splitX = (perServ[0].x + perCup[0].x) / 2;
          break;
        }
      }
    }
    // Fallback: Calories row numbers
    if (splitX == null) {
      const calRow = rowGroups.find(r => r.tokens.some(t => /calories/i.test(t.text)));
      if (calRow) {
        const numXs = calRow.tokens.filter(t => /^\d{2,4}$/.test(t.text)).map(t => t.x).sort((a,b)=>a-b);
        if (numXs.length >= 2) splitX = (numXs[0] + numXs[numXs.length - 1]) / 2;
      }
    }
  } catch {}

  // Geometry-aware extraction: find the block containing "Calories" then
  // pick the nearest numeric block on the same row or the immediate row below.
  let calories: number | undefined;
  try {
    const calLabel = (panelBlocks as Block[]).find(b => /calories/i.test(b.text || ''));
    if (calLabel) {
      const aBox = getBox(calLabel);
      const servingX = findServingColumnX(rowGroups) ?? (splitX != null ? (aBox.x + splitX) / 2 : right(aBox) + aBox.width * 0.8);
      const val = pickNumberNearX(panelBlocks as Block[], centerY(aBox), servingX, Math.max(14, aBox.height * 0.8), false);
      if (val && val >= 50 && val <= 1500) calories = val;
    }
  } catch {}

  // Text fallback if geometry fails
  if (calories == null) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      if (!lower.includes('calor')) continue;
      if (lower.includes('calcium') || lower.includes('kcal')) continue;
      for (let j = i; j < Math.min(lines.length, i + 12); j++) {
        const l = lines[j];
        const numericOnly = l.match(/^\s*(\d{2,4})\s*$/);
        if (numericOnly) {
          const n = Number(numericOnly[1]);
          if (n >= 50 && n <= 1500) { calories = n; break; }
        }
        if (/%/.test(l) || /\bmg\b/i.test(l) || /\bmcg\b/i.test(l) || /(protein|carb|sugar|fat|cholesterol|sodium|fiber)/i.test(l)) {
          continue;
        }
        const matches = extractNumbers(l);
        const first = matches.find(n => n >= 50 && n <= 1500);
        if (first) { calories = first; break; }
      }
      if (calories) break;
    }
  }

  // Protein (geometry-aware, prefer Per serving column if present)
  let proteinGrams: number | undefined;
  try {
    // Try to infer column split in multiple ways
    const perServingHeader = (panelBlocks as Block[]).find(b => /per\s*serving/i.test(b.text || ''));
    const perCupHeader = (panelBlocks as Block[]).find(b => /per\s*1\s*cup|per\s*cup/i.test(b.text || ''));
    let divideX: number | undefined;
    if (perServingHeader && perCupHeader) {
      divideX = (centerX(getBox(perServingHeader)) + centerX(getBox(perCupHeader))) / 2;
    }
    // Fallback: use Calories row numbers (often two numbers e.g., 160 and 35)
    if (divideX == null) {
      const calLabel = (panelBlocks as Block[]).find(b => /calories/i.test(b.text || ''));
      if (calLabel) {
        const rowTolCal = Math.max(12, getBox(calLabel).height * 0.8);
        const sameRowCal = (panelBlocks as Block[]).filter(b => Math.abs(centerY(getBox(b)) - centerY(getBox(calLabel))) <= rowTolCal);
        const calNums = sameRowCal
          .map(b => ({ text: (b.text||'').trim(), x: centerX(getBox(b)) }))
          .filter(it => /^\d{2,4}$/.test(it.text));
        if (calNums.length >= 2) {
          // pick left and right-most numbers and midpoint
          const leftNum = calNums.slice().sort((a,b)=>a.x-b.x)[0];
          const rightNum = calNums.slice().sort((a,b)=>b.x-a.x)[0];
          if (leftNum && rightNum) divideX = (leftNum.x + rightNum.x) / 2;
        }
      }
    }
    if (divideX == null && splitX != null) divideX = splitX;
    const protAnchors = (panelBlocks as Block[]).filter(b => /protein/i.test(b.text || ''));
    if (protAnchors.length) {
      const anchor = protAnchors.sort((a, b) => centerY(getBox(a)) - centerY(getBox(b)))[0];
      const aBox = getBox(anchor);
      // Deterministic cell region: right of label up to splitX
      const servingX = (divideX ?? splitX) != null ? (((divideX ?? splitX) as number) - aBox.width * 0.6) : right(aBox) + aBox.width * 0.8;
      const val = pickNumberNearX(panelBlocks as Block[], centerY(aBox), servingX, Math.max(14, aBox.height * 0.9), true);
      if (val != null && val >= 0 && val < 200) proteinGrams = val;
    }
  } catch {}
  // Fallback to text scanning
  if (proteinGrams == null) {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (!lower.includes('protein')) continue;
      let m = line.match(/protein[^\d]*(\d{1,3})\s*g/i) || line.match(/protein[^\d]*(\d{1,3})\b/i);
      let val: number | undefined;
      if (m) {
        val = Number(m[1]);
        if (!/g/i.test(line) && val >= 100 && val % 10 === 9) { val = Math.floor(val / 10); }
      } else if (/protein[^a-z0-9]*o\s*g/i.test(line) || /protein[^a-z0-9]*og\b/i.test(line)) {
        val = 0;
      }
      if (val != null && val >= 0 && val < 200) { proteinGrams = val; break; }
    }
  }

  // Servings per container (robust: prefer explicit container count; fallback to largest 'about N servings')
  let servingsPerContainer: number | undefined;
  const mContainer = normalizedText.match(/servings?\s*per\s*container[^\d]*(\d+(?:\.\d+)?)/i) ||
    normalizedText.match(/(\d+(?:\.\d+)?)\s*servings?\s*per\s*container/i);
  if (mContainer) {
    const val = Number(mContainer[1]);
    if (isFinite(val) && val > 0 && val < 500) {
      servingsPerContainer = val;
    }
  }
  if (servingsPerContainer == null) {
    const all = Array.from(normalizedText.matchAll(/about\s*(\d+(?:\.\d+)?)\s*servings?/gi)).map(m => Number(m[1]));
    if (all.length) {
      const max = Math.max(...all);
      if (isFinite(max) && max > 0 && max < 500) servingsPerContainer = max;
    }
  }

  // Confidence weighting
  const confidence = (calories ? 0.5 : 0) + (proteinGrams != null ? 0.3 : 0) + (servingsPerContainer ? 0.2 : 0);
  return { calories, proteinGrams, servingsPerContainer, confidence, rawText };
}

// Low-level token access for ROI selection flows
export type OcrToken = { text: string; box: Box };
export async function runOcrTokens(uri: string): Promise<OcrToken[]> {
  const blocks: Block[] = await MlkitOcr.detectFromUri(uri) as any;
  return (blocks as Block[]).map(b => ({ text: b.text || '', box: getBox(b) }));
}



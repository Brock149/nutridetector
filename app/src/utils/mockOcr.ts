export type OcrResult = {
  calories: number;
  proteinGrams: number;
  confidence: number; // 0..1
};

export async function runMockOcrAsync(_imageUri: string): Promise<OcrResult> {
  await new Promise((r) => setTimeout(r, 300));
  return {
    calories: 190,
    proteinGrams: 20,
    confidence: 0.95,
  };
}



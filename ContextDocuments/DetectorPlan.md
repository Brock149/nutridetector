### On-Device Detector Plan (Option B)

Scope: Detect three fields on Nutrition Facts images fully offline, then run OCR on the crops.

Targets (classes)
- `CaloriesValue` (per serving)
- `ProteinValue` (grams per serving)
- `ServingsPerContainer`
- `ServingSizeQuantityUnit` (e.g., "3 oz", "2 tbsp", "1 cup")
- `ServingSizeAltGramsMl` (optional fallback, e.g., "(85 g)", "(240 ml)")

Model
- YOLOv8‑n or EfficientDet‑Lite0 → export to TFLite INT8 (3–8 MB)
- Input size: 512–640 square
- Inference budget: <30 ms on mid‑range Android

Pipeline
1) Capture/upload → resize for detector
2) Run detector → get boxes (x, y, w, h) for targets above
3) Crop each → ML Kit OCR per crop
4) Parse numeric values:
   - Calories: 2–4 digit integer
   - Protein: number + ‘g’
   - Servings: explicit “servings per container” number; fallback to largest ‘about N servings’
   - Serving size: prefer quantity+unit (e.g., 3 oz); fallback to grams/ml
5) Compute: Calories/$, Protein/$ (servings factored), Cal/Protein (per serving), Cost/Serving
   - Plus standardized “meal” metrics using unit → standard mapping (e.g., oz→12 oz):
     - Meals per serving = servingSizeAmount / standardMealAmount(unit)
     - Meals per container = servingsPerContainer × meals per serving
     - Cost per meal, Calories per meal, Protein per meal
6) Confidence gating: if any field missing/low‑conf → compact confirm UI

Labeling Spec
- One box per target field, tight around the number + unit (for protein) or the numeric token (calories/servings)
- Ignore %DV, mg, per‑cup columns; we only label per‑serving calories, per‑serving protein grams, explicit servings per container
- For serving size, label both the household quantity+unit (e.g., "3 oz", "2 tbsp") and the alt grams/ml if present in parentheses (e.g., "(85 g)")
- Save as YOLO format or COCO; class order: [CaloriesValue, ProteinValue, ServingsPerContainer, ServingSizeQuantityUnit, ServingSizeAltGramsMl]

Dataset Goals
- POC: 60–100 images
- MVP: 200–300 images
- Robust: 800–1000 images
- Diversity: boxes, jars, bottles; glossy; curved; multiple brands; tricky layouts (e.g., ‘per 1 cup popped’)

Training (Colab or small GPU)
- Augmentations: rotation ±5–10°, mild blur, brightness/contrast, perspective
- Batch: 16–32; epochs: 100 (resume in chunks on free Colab)
- Save best weights; export to TFLite INT8

App Integration
- Place model at `assets/models/nutri-detector.tflite`
- Native TFLite inference -> returns 3 boxes with confidences
- Crop + OCR + parse → Results
- If field missing → show confirm UI; save failure crops for later labeling

Acceptance (MVP)
- ≥85–92% box localization on 200+ mixed images
- OCR success on ≥90% of localized crops
- Entire flow offline; $0 per scan



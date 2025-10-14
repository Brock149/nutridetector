### On-Device Detector Plan (Option B)

**Status (Sept 27, 2025):** Detector + OCR pipeline is integrated in-app. Current dataset size: 125 labelled photos (YOLO format). Latest model: `nutri-detector-int8.tflite` (float32 inference, fused NMS `[1,300,6]`). Additional labelling + retraining planned.

#### Targets / Classes (5)
- `CaloriesValue` (per serving)
- `ProteinValue`
- `ServingsPerContainer`
- `ServingSizeQuantityUnit` (household qty + unit)
- `ServingSizeAltGramsMl` (metric parentheses, e.g., “(85 g)”, “(240 ml)”)

#### Model
- Base: YOLOv8n (Ultralytics) → TFLite export (float32 for stability; INT8 revisit once calibration dataset available).
- Input: 640×640 square.
- Output: fused NMS tensor `[1,300,6]` (ymin, xmin, ymax, xmax, score, class).
- Inference: `react-native-fast-tflite` via Expo Dev Client.

#### End-to-End Pipeline (implemented)
1. Capture/upload → resize to 640×640 (Expo Image Manipulator).
2. Detector inference → bounding boxes per class.
3. Crop each bounding box → ML Kit OCR (`react-native-mlkit-ocr`).
4. Parse numeric values with artifact normalisation (fractions, O↔0, unit typos) and heuristics per class.
5. Compute metrics: calories/$, protein/$, calories/protein, cost/serving, meals/container, cost/meal (meal multiplier adjustable 1.0–5.0).
6. Confidence gating: combined detection/OCR confidence ≥0.55 auto-fills; otherwise field flagged for manual review on Detect Preview screen.
7. Results screen shows metrics, confidence modals, manual edit flow.

#### Labeling Spec (no change)
- Tight bounding box around the numeric token(s) of interest.
- Ignore %DV columns and secondary columns (focus on per-serving values).
- Serving size: label both household measurement and alt grams/ml separately.
- Format: YOLO TXT with class order `[CaloriesValue, ProteinValue, ServingsPerContainer, ServingSizeQuantityUnit, ServingSizeAltGramsMl]`.

#### Dataset Targets
- Current: 125 images (POC + expanded set).
- MVP Goal: 200–300 images covering wider angles/distances, glare, multi-language packaging.
- Production Goal: 800–1000 diverse images; incremental improvements expected with each labelled batch.

#### Training Workflow
- GitHub Actions workflow `export-tflite.yml` (manual trigger) handles training & export:
  - Pinned toolchain (Python 3.10, Ultralytics 8.3.202, TensorFlow CPU 2.19, etc.).
  - Trains YOLOv8n using labelled dataset (train/val split provided via Drive artifact).
  - Exports `float32` TFLite with `nms=True` (fused NMS) and uploads artifact to `dist/`.
  - Developers replace `app/assets/models/nutri-detector-int8.tflite` with newest export.
- Colab notebooks now superseded by the reproducible GitHub workflow (still available for ad-hoc experiments).

#### App Integration Notes
- Inference requires passing raw typed array (`Float32Array` normalised 0–1).
- Detector fallback logging captures tensor shapes and sample rows for QA.
- Manual override UI collects missing data and logs to support dataset augmentation (future: hook to save failure crops).

#### Acceptance Targets (MVP)
- ≥85% localisation accuracy on 200+ validation images.
- OCR success on ≥90% of localised crops (post-normalisation + threshold tuning).
- End-to-end detection → results latency <1.5 s on mid-range Android.

#### Next Steps / Risks
- Label additional 75–100 photos emphasizing far-distance shots, angled perspectives, and challenging packaging.
- Retrain via GitHub workflow; evaluate lowering auto-fill threshold to 0.45–0.5 per class.
- Consider adding live camera guidance if dataset expansion doesn’t improve far-shot accuracy.
- Investigate storing detector failure cases to streamline relabelling.



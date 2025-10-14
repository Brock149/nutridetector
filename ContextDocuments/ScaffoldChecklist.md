### Nutrition Scan App — Implementation Checklist (Sept 2025 Update)

This checklist tracks what’s complete vs pending after pivoting to the on-device detector pipeline.

Legend: ✅ done · 🟡 in progress · ⏳ not started

---

### 0) Repo & Tooling
- ✅ Expo Dev Client project initialised (`app/` workspace).
- ✅ GitHub Actions `export-tflite.yml` trains + exports YOLOv8 → TFLite (fused NMS).
- ✅ `metro.config.js` updated to bundle `.tflite` assets.
- ✅ `TfliteReproScreen` for native bridge verification.

### 1) Core Dependencies
- ✅ Navigation (`@react-navigation/*`, gesture-handler, reanimated, screens, safe-area-context).
- ✅ Imaging & OCR (`expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `jpeg-js`, `react-native-fast-tflite`, `react-native-mlkit-ocr`).
- 🟡 State/storage: React Context scaffolded for goal mode; tokens/subscription store still pending; SecureStore not wired.

### 2) Navigation & Screens
- ✅ Bottom tabs (Scan, Compare, Account) + stack navigation for results flow.
- ✅ `ScanScreen` with camera/gallery capture + price prompt.
- ✅ `DetectPreviewScreen` with detector overlay, confidence cards, manual override inputs.
- ✅ `ResultsScreen` with metrics, meal multiplier slider, confidence modals, manual edit.
- ⏳ `HistoryScreen` / `CompareScreen` (placeholder navigation only).
- ⏳ `AccountScreen` (tokens/subscription actions not implemented).

### 3) Detector & OCR Pipeline
- ✅ On-device detector integration (`nutri-detector-int8.tflite`).
- ✅ OCR on crops + parsing heuristics.
- ✅ Confidence gating + manual override UI.
- ✅ Logging for debugging (meta info, errors, preview data).
- 🟡 Threshold tuning (currently 0.55; revisit after next training round).
- 🟡 Dataset expansion (125 → target 200+ images) + retrain via GitHub workflow.

### 4) Metrics & UX Enhancements
- ✅ Calories/$, protein/$, calories/protein, cost/serving metrics.
- ✅ Meals/container & cost/meal with adjustable meal multiplier (1–5×, step 0.25).
- ✅ Confidence breakdown modal + OCR debug modal.
- ⏳ Goal-based colour ratings (Cut/Bulk).
- ⏳ Save scan to history/compare from results.

### 5) Tokens & Subscription Rails
- ⏳ React Context store for tokens/subscription (with SecureStore persistence).
- ⏳ Token gating: consume token per scan, watch-ad stub to earn tokens.
- ⏳ Subscription state machine (active/expired/none), restore button stubs.
- ⏳ Paywall surfaces on Scan/Compare when out of tokens or expired.

### 6) History & Compare Workflows
- ⏳ Persist last 3 scans (free tier) locally.
- ⏳ Compare UI (side-by-side metrics, highlight better values).
- ⏳ Premium unlock for larger history (documented only).

### 7) Camera UX Enhancements
- 🟡 Future: live distance/alignment hints if detector confidence low.
- ⏳ Optional crop/refine step only when needed (fallback UX not built yet).

### 8) Testing & QA
- ✅ Fast-tflite repro confirms inference works (sync + async).
- ✅ Manual device testing on Android dev build (Expo Dev Client).
- 🟡 Expand automated lint/tests (none yet).
- 🟡 Collect detector failure examples for retraining loop.

### 9) Documentation & Ops
- ✅ PRD, Detector Plan, Screens Breakdown updated (this pass).
- ✅ Context docs note GitHub Actions workflow and dataset goals.
- 🟡 Maintain living changelog / release notes before beta.

### 10) Next Priorities
1. Label additional photos (hard cases: farther distance, angled shots, glare) → rerun GitHub export → integrate new model.
2. Implement tokens/subscription storage & gating to align with original MVP economic model.
3. Build history & compare experiences to support “value shopping” use case.
4. Add goal-mode colour ratings + quick “Add to compare” action on results.
5. Evaluate camera guidance once new data is in (if far-shot accuracy still low).



📄 Product Requirements Document (PRD)

Project: Nutrition Scan App (MVP)
Version: 1.1
Last Updated: Sept 27, 2025

🎯 Goal

Deliver a cross-platform mobile experience that lets shoppers capture the Nutrition Facts panel, automatically extract the key fields (calories, protein, servings, serving size), and compute goal-oriented value metrics (calories/$, protein/$, meals/container, cost/meal). The MVP must operate fully offline, with monetisation (tokens + subscriptions) layered in once the core UX proves reliable.

Current sprint emphasis: harden the on-device detection/OCR pipeline, provide a smooth review/edit flow, and prepare documentation/automation for future dataset growth and model updates.

🧑‍💻 Target Users

- Fitness-focused shoppers optimising macros vs price in grocery aisles.
- Budget-conscious households comparing packaged foods.
- Early adopters contributing scans and feedback prior to public launch.

Business model (planned):
- Free tier — watch rewarded ads to earn tokens (1 token = 1 scan).
- Subscription tier — unlimited offline scans for active subscribers, validated locally.

Status: Token/subscription flows remain on the roadmap; the current build focuses on capture → detection → metrics.

🔑 MVP Feature Scope

1. On-Device Nutrition Detector ✅
   - YOLOv8n-based model exported to TFLite (`nutri-detector-int8.tflite`).
   - Runs via `react-native-fast-tflite`; outputs fused-NMS `[1,300,6]` tensor.
   - Detector classes: CaloriesValue, ProteinValue, ServingsPerContainer, ServingSizeQuantityUnit, ServingSizeAltGramsMl.

2. OCR + Numeric Parsing ✅
   - Crops per detector box processed with ML Kit OCR.
   - Parsing normalises common OCR artifacts (O↔0, mixed fractions, unit typos) and extracts numeric values + units.
   - Confidence scoring combines detection + OCR to auto-fill fields when ≥0.55; otherwise prompts manual input.

3. Results Experience ✅
   - Displays capture thumbnail, confidence cards, manual edit modal, and detailed confidence breakdown.
   - Metrics include calories/$, protein/$, calories/protein, cost/serving, meals/container, cost/meal.
   - Custom slider (1.0–5.0 servings/meal, step 0.25) recalculates “meal” metrics in real time.

4. Scan Flow (Partial)
   - Camera capture + gallery import functional (Expo Camera / Image Picker).
   - Price input required before navigating to results.
   - History/compare/tab scaffolding tracked in ContextDocuments but not coded yet.

5. Economics Rails (Planned)
   - Rewarded ads for tokens, subscription validation, SecureStore persistence, and paywall UX remain future milestones (see `ScaffoldChecklist.md`).

6. Offline Handling (In Progress)
   - Detector + OCR already offline.
   - Token/subscription state persistence pending.

📈 Current Benchmark (Sept 27 2025)

- Dataset: 125 labelled images (YOLO format) covering standard Nutrition Facts layouts; target 200+ for next retrain.
- GitHub Actions workflow `export-tflite.yml` performs training/export with pinned toolchain and fused NMS output.
- Tflite repro screen verifies `react-native-fast-tflite` integration, ensuring consistent inference call pattern.

🚫 Out of Scope (MVP)

- Cloud inference or backend storage.
- User accounts and cross-device sync.
- Full nutrition databases beyond captured labels.
- Advanced analytics beyond core ratios and meal metric.

📱 Tech Stack Snapshot

- Framework: Expo SDK 54 (Dev Client), React Native 0.81.4, React 19.
- Native modules: `react-native-fast-tflite`, `react-native-mlkit-ocr`.
- Imaging: `expo-image-manipulator`, `expo-image-picker`, `jpeg-js`.
- Navigation: React Navigation (tab + stack configuration).
- State: React Context (tokens/subscription store to be implemented).
- Tooling: GitHub Actions for training/export, Git LFS not required (model <10 MB).

📝 Success Criteria (Updated)

1. Detector localises target fields on ≥85% of validation photos once dataset reaches 200+ images; manual corrections cover tail cases.
2. OCR parsing auto-populates calories/protein/servings/serving size ≥70% of the time on new imagery; manual UI handles remainder.
3. Scan → metric pipeline remains sub-1.5 s on mid-range Android hardware.
4. GitHub export workflow consistently emits a compatible TFLite (`float32`, fused NMS) artefact.
5. Future milestone: token/subscription gating and history/compare features align with documented UX (see `ScaffoldChecklist.md` & `ScreensBreakdown.md`).

📌 Next Planned Enhancements

- Collect 75–100 additional labelled photos (diverse distances/lighting) and retrain using the automated workflow.
- Tune confidence thresholds per class (likely drop to 0.45–0.5 once retrained).
- Build token/subscription rails, history, compare UI per original scaffolding plan.
- Explore live camera guidance (distance, alignment) if dataset expansion doesn’t sufficiently improve detection.
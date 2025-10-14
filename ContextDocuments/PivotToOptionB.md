### Pivot Rationale: From Generic OCR Heuristics to On‑Device Field Detection (Option B)

This document captures why we pivoted from our original ML Kit OCR + heuristics approach to an on‑device tiny detector (Option B), and how the new plan solves the problems we hit.

---

## 1) Original Plan and What Broke

Goal: Take a photo of the Nutrition Facts panel and extract three fields reliably:
- Calories (per serving)
- Protein (grams per serving)
- Servings per container

Initial approach: Generic OCR (ML Kit) + layout heuristics
- Parse all text blocks, try to infer rows/columns (e.g., “Per serving” vs “% DV” vs “Per 1 cup popped”).
- Pick the nearest numeric tokens to the “Calories” and “Protein” label, resolve units (g, mg, %), then compute metrics.

Why it failed in practice:
- Columnized tables: Nutrition panels often have 2–3 columns. ML Kit returns text chunks in an unpredictable order per photo. The same label produced different token graphs between shots.
- Small target numbers: “200”, “8 g”, “15” are visually tiny; token grouping changes with angle/lighting; our rules latched onto wrong numbers (e.g., %DV or per‑cup column).
- Layout variance: “Per 1 cup popped”, per‑container/servings rows, multi‑language panels, curved bottles, glare—too many special cases for heuristic rules to stay stable.
- ROI taps/rectangles: Even with user guidance, device letterboxing/zoom/pan and shifting token graphs meant ROI OCR still returned the wrong or empty text.

Bottom line: Heuristic layout reconstruction wasn’t robust enough. We saw inconsistent results on the same label between shots, which is unacceptable for user confidence.

---

## 2) Cloud Option (A) vs On‑Device Detector (B)

Option A (Cloud form recognizer)
- Pros: Pre‑trained table understanding → fast to reliable results; good with 30–60 examples; great for proof‑of‑value.
- Cons: Requires network and per‑scan cost (¢1–10). Not aligned with our “offline first” and ad‑funded economics.

Option B (On‑device tiny detector + ROI OCR) — Chosen
- What we ship: A small quantized model (~3–8 MB) that directly detects key fields.
- Flow: Detector runs offline → we crop exactly those boxes → run OCR only inside crops → compute metrics.
- Pros: Fully offline, $0 per scan, stable across column layouts, noisy backgrounds, and perspective. Privacy‑preserving.
- Cons: Requires a labelled dataset and a short training pipeline. Accuracy grows with diverse images.

Why B is better for our product:
- Economics: Our ad model (~$0.01/5 scans) can’t afford cloud per‑scan fees.
- UX: Grocery aisles often have poor signal; offline reliability is critical.
- Robustness: Visual detection sidesteps brittle token order; we learn where the values are, not how to reconstruct the whole table.

---

## 3) Expected Accuracy and Data Needs

- ~100 images (labelled with 3 boxes): Proof‑of‑concept; works on many “standard” labels.
- ~200–300 images: MVP; ~85–92% correct field localization on a diverse holdout set.
- ~800–1000 images: Production‑grade; ~93–97% localization; remaining ~3–7% handled by a quick confirm.

Notes:
- Additional images only help if they add new layouts/conditions (brands, glare, packaging). Beyond ~1000, you hit diminishing returns unless you expand variability (e.g., new geographies/languages).
- True 100% is unrealistic in the wild; we’ll implement confidence gating and a one‑tap confirm to make the tail invisible to users.

---

## 4) Implementation Plan

Model & Inference (on‑device)
- Detector: YOLOv8‑n / EfficientDet‑Lite0 (current build: YOLOv8n float32 export with fused NMS).
- Labels: 5 classes → `CaloriesValue`, `ProteinValue`, `ServingsPerContainer`, `ServingSizeQuantityUnit`, `ServingSizeAltGramsMl`.
- Post‑process: choose highest‑confidence boxes; apply sanity checks (bounding-box size/aspect).
- OCR: ML Kit on the 4–5 small crops only → parse numbers → compute metrics.

Data & Training
- Labelling spec: Draw one box per target field. Dataset now at 125 labelled photos; target 200–300 for next training round.
- Training: GitHub Actions workflow `export-tflite.yml` automates environment setup, YOLOv8 training, and TFLite export (float32, fused NMS). Colab notebooks kept for experimentation but no longer primary path.

App Integration
- Ship the TFLite model in the app bundle (`app/assets/models/nutri-detector-int8.tflite`).
- Detector + OCR integrated in `DetectPreviewScreen` with manual override UI and confidence logging.
- Results screen computes advanced metrics (including adjustable “meal” multiplier) and exposes confidence breakdown.

---

## 5) Why This Will Be Better

- Stability: Directly locating the five fields removes the token‑graph randomness of generic OCR.
- Offline + $0 per scan: Aligns with our ad‑funded model and poor‑signal conditions in stores.
- Small footprint: ~6 MB float32 model; fast inference (tens of ms); privacy‑preserving.
- Evolvable: As we see misses, we add those examples to the dataset, retrain, and ship a small model update.

---

## 6) Risks & Mitigations

- Risk: Insufficient diversity → detector misses unusual templates.
  - Mitigation: Prioritise far-distance, angled, glare-heavy shots in next labelling batch; capture failure cases for relabel.

- Risk: OCR still misreads in rare crops (O↔0, g↔9).
  - Mitigation: Numeric normalisation already implemented; continue tuning heuristics and threshold per class.

- Risk: Schedule slippage with free compute.
  - Mitigation: GitHub Actions workflow ensures reproducible exports; rent short-term GPU only if iteration bottlenecks.

---

## 7) Acceptance Criteria (MVP Offline)

- Detector finds each class on a mixed validation set (≥200 photos) with ≥85–92% localisation accuracy.
- OCR on detected crops yields valid numbers in ≥90% of localised cases.
- Low-confidence fallback (Detect Preview manual inputs) adds <10 seconds to flow.
- Entire pipeline runs offline with no per-scan cost.

---

## Addendum (Sept 27, 2025)

- Current dataset: 125 labelled images (Drive archive). Detector integrated in app; confidence gating at 0.55.
- GitHub Actions `export-tflite.yml` reliably produces float32 fused-NMS exports; latest artefact packaged as `nutri-detector-int8.tflite`.
- Next steps: gather ~75 more diverse photos, rerun export, reassess threshold, and capture failure cases for targeted labelling.



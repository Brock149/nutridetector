# 📱 Screen & UX Flow (Nutrition Scan App – Sept 2025 Snapshot)

## 1. **Scan Screen (Default Home)**

* **Top Bar**
  * Token balance + subscription badge (planned; not yet wired in code).
  * Quick link to goal mode (Cut/Bulk) when user returns from results.
* **Main Area**
  * Live camera preview (Expo Camera) with optional gallery import.
  * Capture button centered; secondary button: “Pick from gallery”.
  * Inline status text (“Hold steady”, future note for distance guidance).
* **Flow**
  1. User lands here by default (tab index 0).
  2. Takes photo → image resized to 640×640 for detector.
  3. Detector + OCR run immediately; manual override happens on next screen.
  4. Prompt “Enter price ($)” (required) before navigating to results.
* **Notes**
  * Detector currently performs best when label fills a large portion of the frame; future guidance UX (“Move closer”) remains a backlog idea.
  * Token/subscription gating still TODO; for now the flow is unrestricted.

---

## 2. **Detect Preview / Review (implemented inside `DetectPreviewScreen`)**

* **Purpose**: bridge between capture and results.
* **Contents**
  * Processed 640×640 preview with detector boxes overlaid (class-coloured).
  * Confidence cards for calories/protein/servings/serving size; red highlight if combined confidence < 0.55.
  * Manual inputs for calories, protein, servings, serving size qty+unit, serving size alt (g/ml).
  * Warning panel listing detector/OCR errors (if any).
  * Continue button navigates to results with merged auto/manual values.
* **Status**: shipped and stable.

---

## 3. **Results Screen**

* **Top**: thumbnail of original capture, goal-mode toggle (Cut/Bulk), and price entry summary.
* **Metrics**
  * Calories per dollar, protein per dollar, calories per protein, cost per serving.
  * New: meals per container + cost per meal (based on adjustable meal multiplier).
  * Meal multiplier slider (1–5×, step 0.25) with confidence that auto-updates metrics.
* **Confidence & Overrides**
  * Modal: raw OCR text + copy button (debug).
  * Modal: per-field confidence breakdown (detection %, OCR %, combined, raw text, units).
  * Edit modal for manual updates to calories/protein/servings/serving size values.
* **Future Items**
  * Colour-coded ratings per goal mode.
  * Save-to-history hook (pending history feature).

---

## 4. **History / Compare Screen** (planned)

* Maintain last 3 scans locally for free tier (stub).
* Each card: thumbnail, product nickname (auto from OCR future), top metrics.
* Select up to two → Compare view (side-by-side metrics with highlight on better values).
* Subscription unlocks expanded history and multi-item compare (future milestone).

---

## 5. **Account / Tokens Screen** (planned)

* Token balance, subscription status, next renewal date.
* Buttons: Watch Ad (+5 tokens), Upgrade to Unlimited, Restore Purchases.
* Also houses developer/debug toggles (model version, repro logs) during pre-launch.

---

## 6. **Navigation Model**

* Persistent bottom tabs:
  * `Scan` (default): stack includes Detect Preview + Results.
  * `Compare`: stack will include History, Compare, Results (later reuse).
  * `Account`: account/tokens screens.
* `ResultsScreen` is stack-only (not a tab entry).

---

## 🔑 Open PM Decisions / Backlog

1. **Confidence Thresholds** – currently 0.55 for auto-fill; revisit after next training round.
2. **Camera Guidance** – evaluate “move closer / too close” helper once we have wider dataset.
3. **History Persistence** – design lightweight storage for recent scans (SecureStore vs file system).
4. **Token/Sub Gating** – implement once base UX is locked; see `ScaffoldChecklist.md` for detailed plan.
5. **Compare UX** – confirm metrics + colour scheme; ensure quick add from results to compare list.

---

## 🎯 Phase 1 Deliverable Snapshot

* Completed: detector integration, OCR crops, manual override UI, meal metrics, confidence modals.
* In progress: documentation refresh, dataset expansion + retraining pipeline (GitHub Actions).
* Pending: tokens/subscriptions, history/compare, post-detection guidance.

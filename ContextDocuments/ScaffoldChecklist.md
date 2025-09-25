### Nutrition Scan App — Cursor Scaffolding + OCR Spike Checklist

This is a step-by-step, copy/paste-friendly checklist to scaffold the app quickly, then move into live camera + OCR testing. It reflects the latest decisions:

- **Label OCR, not barcodes** (photo/scan the back nutrition label; parse via OCR)
- **Bottom tabs only**: Scan, Compare, Account
- **Results** is a screen reached from Scan (immediate) or via History/Compare, but is not in the tab bar
- **Tokens** from ads, no backend; default grant can be hardcoded for v1
- **Subscription** works offline using device time; optional light drift guard
- **Goal modes**: Bulk/Cut toggle on Results affects metrics shown and color ratings

---

### 0) Repo initialization

- Use **Expo** with **Dev Client** (decided). No bare RN.

Notes:
- Dev Client allows native modules for camera/OCR while keeping Expo DX.

---

### 1) Create project and base dependencies

- Create Expo app + add Dev Client support
- Install navigation:
  - `@react-navigation/native`
  - `@react-navigation/bottom-tabs`
  - `@react-navigation/native-stack`
  - Platform deps (gesture-handler, reanimated, screens, safe-area-context)
- Install state + storage:
  - State: **React Context** (Provider)
  - Storage: **expo-secure-store** (no AsyncStorage)
- Install camera + prep for OCR spike:
  - Camera: **expo-camera** (initial capture path)
  - OCR: start with a **mock function** returning sample values; later spike ML Kit / Apple Vision

---

### 2) Navigation scaffold (tabs + stacks)

- Root contains a **Bottom Tab Navigator** with 3 tabs:
  - `ScanTab` → stack: `ScanScreen`, `ResultsScreen`
  - `CompareTab` → stack: `HistoryScreen`, `CompareScreen`, `ResultsScreen`
  - `AccountTab` → stack: `AccountScreen`
- Default landing route: `ScanScreen`
- Ensure `ResultsScreen` is reachable but not a tab.

---

### 3) Screen components to scaffold (empty first)

- `ScanScreen`: camera preview, capture button, top bar shows tokens + subscription badge
- `ResultsScreen`: thumbnail, metrics, Bulk/Cut toggle, color rating
- `HistoryScreen`: show recent scans (free: last 3), select items
- `CompareScreen`: side-by-side comparison of 2 items with emphasized better values
- `AccountScreen`: token balance, subscription status, buttons: Watch Ad, Upgrade (IAP), Restore Purchases

---

### 4) Global state + persistence

- Create a lightweight store (**React Context**) for:
  - `subscription_status`: `active | expired | none`
  - `valid_until`: ISO string
  - `last_verified`: ISO string
  - `tokens`: number
  - `goalMode`: `bulk | cut` (default: `cut`)
- Persist to **SecureStore** on change and hydrate on app start.
- Define storage keys upfront to avoid churn:
  - `app/subscription_status`
  - `app/valid_until`
  - `app/last_verified`
  - `app/tokens`
  - `app/goal_mode`

---

### 5) Token model (ads) — MVP

- Hardcode default token grant per ad (e.g., `DEFAULT_TOKENS_PER_AD = 5`)
- Define functions:
  - `earnTokens(count: number)`
  - `consumeToken()`
  - `getTokenBalance()`
- Gate scan start:
  - If `subscription_status === active` → allow
  - Else if `tokens > 0` → `consumeToken()` and allow
  - Else → prompt to watch ad or subscribe
- Integrate rewarded ads later; for now stub `watchAdAsync()` that calls `earnTokens(DEFAULT_TOKENS_PER_AD)`.

---

### 6) Subscription model — MVP (offline first)

- Purchase success flow (stub until IAP integration):
  - Set `subscription_status = active`
  - Set `valid_until = now + 30 days`
  - Set `last_verified = now`
- App launch check:
  - If `now < valid_until` → `active`
  - Else → `expired` and show renew/restore
- Restore button (stub for now): sets state if validation succeeds later.
- Optional light drift guard (no backend):
  - If device time is unexpectedly behind `last_verified` by > 24h, show a soft warning; still honor `valid_until`.

---

### 7) OCR spike (earliest live test)

- Permissions: request camera permission on `ScanScreen` mount.
- Capture path:
  1) User taps capture → take still image (full label, no mandatory crop)
  2) For v1 scaffold: call **mock OCR** to return calories/protein; later replace with real OCR
  3) If OCR confidence below threshold → offer optional crop/refine flow
  4) Prompt for price ($) after OCR, before results
- Minimal parsing targets for v1 metrics:
  - Calories (per serving)
  - Protein grams (per serving)
  - Serving size (optional for v1 if not needed for ratios)
- Compute and display:
  - `caloriesPerDollar = calories / price`
  - `proteinPerDollar = proteinGrams / price`
  - `proteinPerCalorie = proteinGrams / calories`
- Show `ResultsScreen` with:
  - Image thumbnail
  - Metrics above
  - Goal toggle: **Bulk | Cut** (top)
  - Color-coded rating thresholds depend on goal mode (keep simple, adjustable constants)

---

### 8) History/Compare — MVP

- Save each completed result (thumbnail uri, parsed fields, metrics, timestamp, optional title)
- Free users: keep the last **3** items locally
- Compare flow:
  - Select up to 2 items → `CompareScreen`
  - Side-by-side metrics, highlight better column per metric

---

### 9) UI copy and states (MVP)

- Empty states:
  - No tokens left → prompt Watch Ad or Subscribe
  - Subscription expired → Renew or Restore
  - History empty → prompt to scan
- Price prompt: numeric keypad; must enter to proceed to results
- Top bar badges:
  - Tokens: `🔑 {n} tokens`
  - Subscription: `⭐ Unlimited` when active

---

### 10) Acceptance criteria (MVP slice)

- Tabs render: Scan (default), Compare, Account
- Camera permission and preview work; capture returns an image
- OCR returns text; app parses calories and protein in a happy path label
- Price entry prompt appears post-OCR and gating logic works (tokens/subscription)
- Results screen calculates and displays 3 metrics; color ratings change with Bulk/Cut
- History stores up to 3 items (free); Compare shows two items side-by-side
- State persists across app restarts (tokens, subscription fields, goal mode)

---

### 11) Nice-to-haves (post-MVP or later in MVP)

- Local configurable override for default token grant (read from AsyncStorage if set)
- Simple crop/refine UI when OCR confidence is low
- Basic heuristics to parse labels more robustly (US FDA format first)
- Minimal theming support for color scales per goal

---

### 12) Work plan (suggested order)

1) Scaffold project + navigation (tabs + stacks)
2) Add global store + persistence for tokens/subscription/goal mode
3) Implement gating logic (tokens/subscription) with stubbed ad + IAP actions
4) Wire camera preview and capture on `ScanScreen`
5) Integrate OCR and parse calories/protein (full-image first)
6) Add price prompt and navigate to `ResultsScreen`
7) Compute metrics, render ratings with Bulk/Cut toggle
8) Save results to history and build Compare view
9) Polish states (empty/expired/no-tokens) and persistence
10) Prepare for live device testing on both platforms

---

### 13) Implementation notes (to reference while coding)

- Keep constants together (thresholds, colors, defaults): `constants/metrics.ts`
- Data shapes:
  - ScanResult: `{ id, imageUri, calories, proteinGrams, price, metrics, createdAt }`
  - Metrics: `{ caloriesPerDollar, proteinPerDollar, proteinPerCalorie }`
- Keep OCR parsing modular so we can iterate on regex/heuristics per locale
- Favor early returns and predictable state updates; persist after each meaningful change

---

### 14) Risks and mitigations

- OCR variability across labels → start with common US FDA layout; add fallback manual inputs if needed
- Expo vs native module compatibility → use Expo Dev Client if staying in Expo; otherwise Bare RN
- Store review for subscriptions → ensure restore button is present; clear offline behavior

---

### 15) Dev workflow (Expo Dev Client by default)

- Primary: **Development Build (Dev Client)** for live camera + future OCR (ML Kit / Apple Vision)
- Commands:
  - `npm run android` → builds/installs dev client and opens Android
  - `npm run ios` → builds/installs dev client and opens iOS (on macOS)
  - `npm start` → start server with `--dev-client` and attach to installed build
- Optional: **Expo Go** for quick UI-only iteration
  - `npx expo start` then press `s` to switch to Expo Go
  - Limitations: no native OCR



Lean Business Canvas – Gym Nutrition Shopping App (Sept 2025 refresh)

1. Customer Segments

- Gym-goers, athletes, and lifters optimising macros per dollar.
- Budget-conscious shoppers comparing frozen meals, snacks, and pantry staples.
- Health-conscious households wanting quick clarity on misleading serving sizes.
- Early adopters willing to label data / provide feedback during beta.

2. Problem

- Nutrition labels hide key ratios (protein/$, calories/$) behind tiny numbers and tricky serving sizes.
- Shoppers waste time googling or doing mental math; hard to compare two items in-store.
- Serving sizes differ wildly (3 oz vs 12 oz) causing deceptive cost-per-meal perceptions.

3. Unique Value Proposition

- “Instant grocery coaching for your fitness goals.”
- On-device detector + OCR finds calories, protein, servings, serving size in seconds, even offline.
- Calculates cost/meal, calories/$, protein/$ with a tunable “meal multiplier”.
- Confidence overlays and quick manual edits keep trust high.

4. Solution

- Mobile app (iOS/Android, Expo Dev Client stack) with camera capture or gallery import.
- Runs YOLOv8 detector + ML Kit OCR directly on device; no network required.
- Results screen shows metrics, confidence, and manual override; compares how many “meals” per container.
- Future versions add history/compare, goal-mode colour ratings, and saved scans.

5. Channels

- App Store / Google Play listings.
- Fitness creators, gym partners, nutrition coaches for co-marketing.
- Social media challenges (e.g., “best protein per dollar” series).
- In-store demos with health-food retailers once MVP is stable.

6. Revenue Streams

- Freemium token model: watch rewarded ads → earn scan tokens (planned).
- Monthly subscription unlocks unlimited offline scans + history/compare (planned).
- Longer term: affiliate links to partner stores, white-label/licensing for gym chains.

7. Cost Structure

- App development (mobile + detector training + OCR integration).
- Dataset labelling (internal time + potential contractors).
- Marketing/creator partnerships and store demos.
- App store fees, customer support, legal/compliance for subscriptions.

8. Key Metrics

- Weekly active scanners & scans/session.
- Auto-fill success rate vs manual overrides (confidence telemetry).
- Conversion from free scans → token purchase → subscription.
- Retention of comparison/history features once shipped.

9. Unfair Advantage

- Proprietary labelled dataset + on-device detector tuned for Nutrition Facts panels.
- Offline-first experience aligned with grocery environments (no signal needed).
- Fitness-focused messaging (meals-per-container, bulk/cut modes) differentiates from generic nutrition apps.
- Automated GitHub training pipeline enables rapid iteration as new data arrives.
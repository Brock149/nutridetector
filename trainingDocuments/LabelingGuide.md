### Labeling Guide (Option B – On‑Device Detector)

Goal: Draw 3 boxes per image on the Nutrition Facts panel:
- CaloriesValue (per serving)
- ProteinValue (grams per serving)
- ServingsPerContainer (explicit servings per container)

What to include in each box
- CaloriesValue: Only the numeric calories per serving (e.g., the “200” in “Calories 200”).
- ProteinValue: The number and its “g” (e.g., “8 g” or “8g”).
- ServingsPerContainer: The numeric count near “servings per container” (e.g., “15”). If multiple candidates (about 2.5 per bag, 15 per container), select the per‑container number.

What to ignore
- %DV column, mg values, per‑cup/per‑popped columns.
- Macronutrient labels (Protein, Total Fat, etc.) — only box the value tokens.

Image collection tips
- Capture the full Nutrition Facts panel, straight and well‑lit.
- Include variety: boxes, jars, bottles; glossy/curved; different brands; tricky layouts like popcorn.
- Avoid extreme blur; a little tilt is fine.

Export format
- Use YOLO format or COCO. Class order must be:
  0: CaloriesValue
  1: ProteinValue
  2: ServingsPerContainer

Folder structure (YOLO)
```
dataset/
  images/
    train/   ... .jpg
    val/     ... .jpg
  labels/
    train/   ... .txt (YOLO labels)
    val/     ... .txt
  data.yaml
```

Example YOLO label line (one per box)
```
<class_id> <x_center_norm> <y_center_norm> <width_norm> <height_norm>
```

data.yaml example
```
path: dataset
train: images/train
val: images/val
nc: 3
names: [CaloriesValue, ProteinValue, ServingsPerContainer]
```

Quality checklist
- Boxes are tight (no huge margins) and over the correct numbers.
- Servings box picks per‑container (not per‑bag or per‑cup) when both present.
- Protein box includes the “g”.



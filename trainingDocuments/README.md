### Dataset folder template (put your files here)

Use this structure under `trainingDocuments/dataset/`:

```
trainingDocuments/
  dataset/
    images/
      train/   # place ~80% of your labeled images here
      val/     # place ~20% here
    labels/
      train/   # matching .txt YOLO labels for images/train
      val/     # matching .txt YOLO labels for images/val
    data.yaml  # already created with class names
```

How to split 80/20
- Move ~20% of your images (and their matching .txt files) into `val`; keep the rest in `train`.
- Filenames must match exactly, e.g., `IMG_001.jpg` ↔ `IMG_001.txt`.

Next step
- Share the `trainingDocuments/dataset/` folder (zip or Drive link). I’ll train the model and return `nutri-detector-int8.tflite` for the app.



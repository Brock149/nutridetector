### Training Notebook (Overview)

You’ll run a Colab notebook I provide. Steps (non‑technical):

1) Open the Colab link I’ll share (it contains all code).
2) Mount Google Drive (one click). It creates a `/content/drive/MyDrive/nutri-detector/` folder.
3) Upload the `dataset/` folder (from LabelingGuide) into that Drive path.
4) Run cells in order:
   - Install dependencies (Ultralytics YOLO, OpenCV, etc.)
   - Verify dataset (sanity check visuals)
   - Train
   - Export TFLite INT8
   - Zip the model and download to your computer (or I can do this part for you)

Notes
- On free Colab, sessions may time out. The notebook saves checkpoints to Drive; if interrupted, rerun and it will resume.
- If we want faster training, I’ll spin a ~$20 GPU instance and finish same‑day.

Hand‑off
- You’ll give me the exported model file (e.g., `nutri-detector-int8.tflite`).
- I’ll drop it into `app/assets/models/` and wire it in the app.



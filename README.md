# MOODIFY — Enhanced Flask Mood-to-Music Website

A responsive, multi-page website that uses a browser webcam, OpenCV face detection, DeepFace expression estimation, and a local CSV song library. **No Spotify API or Spotify credentials are used.**

## Included pages
- `/` — long-form home page with introduction, workflow, features, mood categories and CTA
- `/detect` — live camera preview, capture, face detection, expression result and helpful status messages
- `/music` — CSV-based song recommendations and supported mood categories
- `/about` — project overview, technology stack, processing pipeline, privacy and limitations

## 1. Requirements
- Windows 10/11, macOS or Linux
- Python 3.10 or 3.11 recommended (avoid Python 3.13 for this DeepFace/TensorFlow stack unless you have confirmed compatible wheels)
- Working webcam
- Internet connection for the first DeepFace model download (after it is downloaded, analysis can generally run locally)

## 2. Install and run (Windows)
Open the project folder in VS Code. In the VS Code terminal run:

```bash
pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:5000** in Chrome or Edge. On Windows, you can also double-click `run_windows.bat` to install/check dependencies and start the server.

## 3. Camera troubleshooting
- Use `http://127.0.0.1:5000` or `http://localhost:5000`. Browser camera access normally requires localhost or HTTPS.
- Allow camera permission from the browser's address-bar/lock icon.
- Close other apps using the webcam (Zoom, Teams, Windows Camera).
- Use good front lighting, face the camera and keep your face in the preview.
- If no face is detected, move closer and capture again.
- While the camera is running, the app sends a downscaled frame to the local Flask server after each analysis completes, with a short pause between checks. Processing speed depends on your computer. Press **Stop** to end live analysis.
- The first DeepFace analysis may be slower because model weights may need to download. Wait for it to finish.

## 4. Fixing common errors
**`Failed to fetch` / `Could not reach Flask server`:** Make sure `python app.py` is still running and the terminal has no traceback. Open the site from `http://127.0.0.1:5000`, not by opening an HTML file directly. Refresh after restarting Flask.

**`AI libraries are not installed correctly`:** Run `pip install -r requirements.txt` in the same Python environment used to run `python app.py`.

**Camera permission denied:** Allow camera access in browser settings and reload the page.

**Camera already in use:** Close other webcam applications and press Start camera again.

**First model run is slow:** DeepFace may download model weights the first time. Keep the terminal open and wait; later runs should be faster.

## 5. Customize the CSV song library
Edit `data/songs.csv`. Keep this exact header:

`title,artist,mood,genre,language`

The sample library contains 102 songs in Hindi, Bengali, and English, with at least 15 songs for every mood. Mood detection returns up to 15 recommendations.

Supported mood values: `happy`, `sad`, `calm`, `chill`, `energetic`, `uplifting`.

Emotion mapping:
- happy → happy
- sad → sad
- angry and fear → calm
- neutral → chill
- surprise → energetic
- disgust → uplifting

Add rows using the same columns. Song links open YouTube search results; this website does not host or play music itself.

## Privacy and limitations
The live camera preview is displayed in the browser. While live analysis is active, a downscaled frame is sent to the local Flask server after each analysis completes, with a short pause between checks; pressing **Stop** ends the camera and analysis. Frames are processed locally and are not saved to disk or sent to a cloud service by this project. The model estimates visible facial expression and cannot reliably identify someone's true feelings, personality or mental-health state.

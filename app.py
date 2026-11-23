import os
from flask import Flask, render_template, request, session
from dotenv import load_dotenv

from emotion import detect_emotion, smooth_emotion
from song_recommender import get_available_moods, get_song_count, recommend_songs

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "moodify-local-development-key")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

def error_response(message, status_code):
    """Return one consistent error response for the API."""
    return {"success": False, "error": message}, status_code


@app.route("/")
def home():
    """Show the home page and the number of songs in the library."""
    return render_template("index.html", song_count=get_song_count())

@app.route("/detect")
def detect_page():
    return render_template("detect.html")

@app.route("/music")
def music_page():
    emotion = session.get("emotion")
    if emotion:
        songs = recommend_songs(emotion, limit=30)
    else:
        songs = []

    return render_template(
        "music.html",
        emotion=emotion,
        confidence=session.get("confidence"),
        songs=songs,
        available_moods=get_available_moods()
    )

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/health")
def health():
    return {"status": "ok", "service": "MOODIFY", "message": "Flask server is responding."}

@app.route("/api/detect", methods=["POST"])
def detect_api():
    """Receive a camera image and return its estimated mood."""
    if request.mimetype != "multipart/form-data":
        return error_response("Invalid request format.", 415)

    image_file = request.files.get("image")
    if image_file is None:
        return error_response("No camera image was received.", 400)

    try:
        image_bytes = image_file.read()
        if not image_bytes:
            return error_response("No camera image was received.", 400)

        live_mode = request.form.get("live") == "true"
        result = detect_emotion(image_bytes)

        if live_mode:
            emotion_history = session.get("emotion_history", [])
            emotion, confidence = smooth_emotion(
                emotion_history,
                result["emotion"],
                result["confidence"]
            )
            result["emotion"] = emotion
            result["confidence"] = confidence
            session["emotion_history"] = emotion_history
        else:
            session.pop("emotion_history", None)

        if not live_mode:
            songs = recommend_songs(result["emotion"], limit=15)
            session["emotion"] = result["emotion"]
            session["confidence"] = result["confidence"]
            result["songs"] = songs
            result["song_count"] = len(songs)

        result["success"] = True
        return result
    except ValueError as error:
        return error_response(str(error), 422)
    except ImportError as error:
        message = "Install the required AI packages with pip install -r requirements.txt. " + str(error)
        return error_response(message, 503)
    except Exception:
        app.logger.exception("Mood detection failed")
        message = "The AI model could not analyse the image. Restart the app and try again."
        return error_response(message, 500)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)

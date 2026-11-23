import csv
from pathlib import Path
from urllib.parse import quote_plus


CSV_PATH = Path(__file__).parent / "data" / "songs.csv"

EMOTION_TO_MOOD = {
    "happy": "happy",
    "sad": "sad",
    "angry": "calm",
    "neutral": "chill",
    "fear": "calm",
    "surprise": "energetic",
    "disgust": "uplifting"
}

def read_songs():
    """Read song rows from the CSV file."""
    if not CSV_PATH.exists():
        raise FileNotFoundError("Song dataset not found: " + str(CSV_PATH))

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def get_song_count():
    """Return the number of songs in the CSV file."""
    return len(read_songs())


def recommend_songs(emotion, limit=15):
    """Find songs whose mood matches the detected expression."""
    if limit <= 0:
        return []

    detected_emotion = str(emotion or "").lower()
    recommended_mood = EMOTION_TO_MOOD.get(detected_emotion, "chill")
    matching_songs = []

    for song_row in read_songs():
        song_mood = song_row.get("mood", "").strip().lower()
        if song_mood != recommended_mood:
            continue

        title = song_row.get("title", "").strip()
        artist = song_row.get("artist", "").strip()
        if not title:
            continue

        search_text = quote_plus(title + " " + artist)
        matching_songs.append({
            "title": title,
            "artist": artist,
            "mood": recommended_mood,
            "genre": song_row.get("genre", ""),
            "language": song_row.get("language", ""),
            "search_url": "https://www.youtube.com/results?search_query=" + search_text
        })

        if len(matching_songs) >= limit:
            break

    return matching_songs


def get_available_moods():
    """Return all mood categories found in the CSV file."""
    moods = []
    for song_row in read_songs():
        mood = song_row.get("mood", "").strip().lower()
        if mood != "" and mood not in moods:
            moods.append(mood)
    return sorted(moods)

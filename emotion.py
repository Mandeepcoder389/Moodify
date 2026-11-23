import cv2
import numpy as np


EMOTION_NAMES = [
    "angry",
    "disgust",
    "fear",
    "happy",
    "sad",
    "surprise",
    "neutral"
]

FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def decode_image(image_bytes):
    """Turn image bytes from the camera into an OpenCV image."""
    if not image_bytes:
        raise ValueError("No camera image was received.")

    if len(image_bytes) > 6 * 1024 * 1024:
        raise ValueError("The camera image is too large.")

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("The captured image is not valid.")

    original_height, original_width = frame.shape[:2]
    if max(original_height, original_width) > 480:
        scale = 480 / max(original_height, original_width)
        frame = cv2.resize(
            frame,
            (
                max(1, int(original_width * scale)),
                max(1, int(original_height * scale))
            ),
            interpolation=cv2.INTER_AREA
        )

    scale_x = original_width / frame.shape[1]
    scale_y = original_height / frame.shape[0]
    return frame, scale_x, scale_y


def improve_lighting(frame):
    """Make faces easier to see in low or uneven light."""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    light, green, blue = cv2.split(lab)

    # CLAHE balances the brightness without making the face too bright.
    light = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    ).apply(light)

    lab = cv2.merge((light, green, blue))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def find_largest_face(faces):
    """Find the largest face in the image."""
    largest = None
    largest_size = 0

    for face in faces:
        region = face.get("region", {})
        width = int(region.get("w", 0))
        height = int(region.get("h", 0))
        size = width * height

        if size > largest_size:
            largest = face
            largest_size = size

    return largest


def smooth_emotion(history, emotion, confidence):
    """Use the recent frames to prevent live emotion flickering."""
    history.append({
        "emotion": emotion,
        "confidence": confidence
    })

    if len(history) > 2:
        history.pop(0)

    scores = {}

    for index, item in enumerate(history):
        name = item["emotion"]
        score = item["confidence"] * (index + 1)
        scores[name] = scores.get(name, 0) + score

    final_emotion = max(scores, key=scores.get)
    matching_results = [
        (index + 1, item["confidence"])
        for index, item in enumerate(history)
        if item["emotion"] == final_emotion
    ]
    total_weight = sum(weight for weight, _ in matching_results)
    final_confidence = sum(
        weight * confidence for weight, confidence in matching_results
    ) / total_weight

    return final_emotion, round(final_confidence, 1)


def detect_emotion(image_bytes):
    """Detect the emotion of the largest face in the image."""
    frame, scale_x, scale_y = decode_image(image_bytes)
    frame = improve_lighting(frame)

    try:
        from deepface import DeepFace
    except ImportError:
        raise ImportError("DeepFace is missing.")

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    detected_faces = FACE_CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.15,
        minNeighbors=4,
        minSize=(30, 30)
    )

    face_region = None
    if len(detected_faces) > 0:
        face_region = max(detected_faces, key=lambda box: box[2] * box[3])
        x, y, width, height = face_region
        frame_for_ai = frame[max(0, y):y + height, max(0, x):x + width]
        detector_backend = "skip"
    else:
        frame_for_ai = frame
        detector_backend = "opencv"

    try:
        result = DeepFace.analyze(
            img_path=frame_for_ai,
            actions=["emotion"],
            detector_backend=detector_backend,
            enforce_detection=True,
            align=False,
            silent=True
        )
    except Exception as error:
        error_text = str(error).lower()

        if "face" in error_text or "detect" in error_text:
            raise ValueError(
                "No clear face detected. Face the camera and improve the lighting."
            )

        raise RuntimeError("The AI model could not analyse the image.") from error

    # DeepFace can return one result or a list of results.
    if isinstance(result, list):
        faces = result
    else:
        faces = [result]

    if face_region is None:
        face = find_largest_face(faces)
        if face is None:
            raise ValueError(
                "No clear face detected. Face the camera and improve the lighting."
            )
    else:
        face = faces[0] if isinstance(faces, list) and faces else faces

    scores = face.get("emotion")
    if not isinstance(scores, dict):
        raise RuntimeError("The AI model did not return emotion scores.")

    emotion = ""
    best_score = -1

    for name in EMOTION_NAMES:
        score = scores.get(name)
        if score is not None and float(score) > best_score:
            emotion = name
            best_score = float(score)

    if not emotion:
        raise RuntimeError("The AI model did not return emotion scores.")

    confidence = round(max(0, min(100, best_score)), 1)

    if face_region is not None:
        x, y, width, height = face_region
        region = {"x": x, "y": y, "w": width, "h": height}
    else:
        region = face.get("region", {})

    return {
        "emotion": emotion,
        "confidence": confidence,
        "region": {
            "x": int(region.get("x", 0) * scale_x),
            "y": int(region.get("y", 0) * scale_y),
            "w": int(region.get("w", 0) * scale_x),
            "h": int(region.get("h", 0) * scale_y)
        }
    }

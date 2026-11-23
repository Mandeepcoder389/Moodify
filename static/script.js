let camera = document.getElementById("camera");

if (camera) {
  let startButton = document.getElementById("startCamera");
  let captureButton = document.getElementById("captureButton");
  let stopButton = document.getElementById("stopCamera");
  let statusBox = document.getElementById("status");
  let statusText = statusBox.querySelector("p");
  let cameraState = document.getElementById("cameraState");
  let cameraStateText = document.getElementById("cameraStateText");
  let placeholder = document.getElementById("cameraPlaceholder");
  let liveOverlay = document.getElementById("liveOverlay");
  let capturedFace = document.getElementById("capturedFace");
  let capturedPlaceholder = document.getElementById("capturedPlaceholder");
  let emotionLabel = document.getElementById("emotion");
  let emotionEmoji = document.getElementById("emotionEmoji");
  let confidenceLabel = document.getElementById("confidence");
  let confidenceFill = document.getElementById("confidenceFill");
  let resultTitle = document.getElementById("resultTitle");
  let resultMode = document.getElementById("resultMode");
  let snapshotCanvas = document.getElementById("snapshotCanvas");

  let emotionIcons = {
    angry: { name: "fa-frown-o", glyph: "\uf119" },
    disgust: { name: "fa-meh-o", glyph: "\uf11a" },
    fear: { name: "fa-exclamation-circle", glyph: "\uf06a" },
    happy: { name: "fa-smile-o", glyph: "\uf118" },
    neutral: { name: "fa-meh-o", glyph: "\uf11a" },
    sad: { name: "fa-frown-o", glyph: "\uf119" },
    surprise: { name: "fa-exclamation-circle", glyph: "\uf06a" }
  };

  let cameraStream = null;
  let liveActive = false;
  let liveBusy = false;
  let busy = false;
  let liveTimer = null;
  let capturePinned = false;

  function setStatus(message, type) {
    statusText.textContent = message;
    statusBox.dataset.type = type || "info";
  }

  function showEmotion(emotion) {
    if (!emotion) {
      emotionLabel.textContent = "—";
      emotionEmoji.className = "result-emoji fa fa-meh-o";
      return;
    }

    emotion = emotion.toLowerCase();
    emotionLabel.textContent = emotion.toUpperCase();
    let icon = emotionIcons[emotion] || emotionIcons.neutral;
    emotionEmoji.className = "result-emoji fa " + icon.name;
  }

  function showResult(emotion, confidence) {
    showEmotion(emotion);
    confidenceLabel.textContent = confidence + "%";
    confidenceFill.style.width = Math.max(0, Math.min(100, Number(confidence))) + "%";
  }

  function resetResult() {
    showEmotion(null);
    confidenceLabel.textContent = "â€”";
    confidenceFill.style.width = "0%";
  }

  function takePhoto(maxWidth) {
    if (!cameraStream || camera.readyState < 2) {
      throw new Error("The camera is not ready yet.");
    }

    let scale = Math.min(1, maxWidth / camera.videoWidth);
    snapshotCanvas.width = Math.round(camera.videoWidth * scale);
    snapshotCanvas.height = Math.round(camera.videoHeight * scale);

    let context = snapshotCanvas.getContext("2d");
    context.drawImage(camera, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

    return new Promise(function (resolve, reject) {
      snapshotCanvas.toBlob(function (image) {
        if (!image) {
          reject(new Error("Could not capture an image."));
          return;
        }

        resolve({ image: image, scale: scale });
      }, "image/jpeg", 0.78);
    });
  }

  function clearFaceBox() {
    if (liveOverlay.width !== camera.videoWidth) {
      liveOverlay.width = camera.videoWidth;
    }
    if (liveOverlay.height !== camera.videoHeight) {
      liveOverlay.height = camera.videoHeight;
    }

    let context = liveOverlay.getContext("2d");
    context.clearRect(0, 0, liveOverlay.width, liveOverlay.height);
  }

  function drawFace(region, scale, emotion, confidence) {
    clearFaceBox();

    if (!region) {
      return;
    }

    let context = liveOverlay.getContext("2d");
    let boxWidth = Math.round(region.w / scale);
    let boxHeight = Math.round(region.h / scale);
    let x = Math.max(0, camera.videoWidth - Math.round((region.x + region.w) / scale));
    let y = Math.max(0, Math.round(region.y / scale));

    context.strokeStyle = "#a9f58c";
    context.lineWidth = 3;
    context.strokeRect(x, y, boxWidth, boxHeight);

    let icon = emotionIcons[emotion] || emotionIcons.neutral;
    let emotionName = emotion.charAt(0).toUpperCase() + emotion.slice(1) + "  " + confidence + "%";
    let scoreLabel = "Confidence: " + confidence + "%";
    let labelHeight = 76;

    context.font = "26px FontAwesome";
    let iconWidth = context.measureText(icon.glyph).width;
    context.font = "bold 26px sans-serif";
    let emotionWidth = iconWidth + 8 + context.measureText(emotionName).width;
    context.font = "20px sans-serif";
    let scoreWidth = context.measureText(scoreLabel).width;
    let labelWidth = Math.min(camera.videoWidth, Math.ceil(Math.max(emotionWidth, scoreWidth) + 24));
    let labelX = Math.max(0, Math.min(x + 8, camera.videoWidth - labelWidth));
    let labelY = Math.max(
      0,
      Math.min(y + boxHeight - labelHeight, camera.videoHeight - labelHeight)
    );

    context.fillStyle = "rgba(22, 61, 27, 0.94)";
    context.fillRect(labelX, labelY, labelWidth, labelHeight);
    context.fillStyle = "#a9f58c";
    context.font = "26px FontAwesome";
    context.fillText(icon.glyph, labelX + 12, labelY + 31);
    context.fillStyle = "#ffffff";
    context.font = "bold 26px sans-serif";
    context.fillText(emotionName, labelX + 12 + iconWidth + 8, labelY + 31, labelWidth - 24 - iconWidth - 8);
    context.font = "20px sans-serif";
    context.fillText(scoreLabel, labelX + 12, labelY + 61, labelWidth - 24);
  }

  async function sendFrame(image, live) {
    let formData = new FormData();
    formData.append("image", image, "camera.jpg");
    formData.append("live", live ? "true" : "false");

    let response = await fetch("/api/detect", {
      method: "POST",
      headers: {
        "Accept": "application/json"
      },
      body: formData
    });

    let text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("The server returned an unexpected response.");
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Mood detection failed.");
    }
    return data;
  }

  async function analyzeLiveFrame() {
    if (!liveActive || busy || liveBusy) {
      liveTimer = setTimeout(analyzeLiveFrame, 500);
      return;
    }

    liveBusy = true;
    try {
      let photo = await takePhoto(360);
      let data = await sendFrame(photo.image, true);
      drawFace(data.region, photo.scale, data.emotion, data.confidence);
      if (!capturePinned) {
        showResult(data.emotion, data.confidence);
      }
      setStatus("Face found. Updating your estimated expression.", "success");
      cameraStateText.textContent = "LIVE ANALYSIS";
      cameraState.classList.add("is-on");
    } catch (error) {
      clearFaceBox();
      setStatus(error.message || "Live analysis failed.", "error");
    }

    liveBusy = false;
    if (liveActive) {
      liveTimer = setTimeout(analyzeLiveFrame, 250);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera access needs localhost or HTTPS.", "error");
      return;
    }

    startButton.disabled = true;
    setStatus("Requesting camera permission...");

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      camera.srcObject = cameraStream;
      await camera.play();
      placeholder.hidden = true;
      capturedFace.hidden = true;
      capturedPlaceholder.hidden = false;
      resultTitle.textContent = "Live expression";
      resultMode.textContent = "LIVE";
      capturePinned = false;
      resetResult();
      captureButton.disabled = false;
      stopButton.disabled = false;
      cameraStateText.textContent = "LIVE ANALYSIS";
      cameraState.classList.add("is-on");

      liveActive = true;
      liveTimer = setTimeout(analyzeLiveFrame, 250);
      setStatus("Looking for your face. The first check may take longer.", "info");
    } catch (error) {
      stopCamera();
      setStatus(error.message || "Could not open the camera.", "error");
    }
  }

  function stopCamera() {
    liveActive = false;
    clearTimeout(liveTimer);

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    camera.srcObject = null;
    placeholder.hidden = false;
    clearFaceBox();
    cameraStateText.textContent = "CAMERA OFF";
    cameraState.classList.remove("is-on");
    captureButton.disabled = true;
    stopButton.disabled = true;
    startButton.disabled = false;
  }

  async function captureAndDetect() {
    if (busy) return;

    busy = true;
    captureButton.disabled = true;
    captureButton.textContent = "Analysing...";
    setStatus("Capturing a frame for song recommendations.", "info");

    try {
      let photo = await takePhoto(960);
      let data = await sendFrame(photo.image, false);

      capturePinned = true;
      let context = snapshotCanvas.getContext("2d");
      context.strokeStyle = "#7ddc41";
      context.lineWidth = 2;
      context.strokeRect(data.region.x, data.region.y, data.region.w, data.region.h);
      capturedFace.src = snapshotCanvas.toDataURL("image/jpeg", 0.78);
      capturedFace.hidden = false;
      capturedPlaceholder.hidden = true;
      resultTitle.textContent = "Captured expression";
      resultMode.textContent = "CAPTURED";
      showResult(data.emotion, data.confidence);

      setStatus(
        "Expression estimated. " + (data.song_count || data.songs.length) +
        " matching songs found.",
        "success"
      );
    } catch (error) {
      setStatus(error.message || "Mood detection failed.", "error");
    } finally {
      busy = false;
      captureButton.textContent = "Capture & detect";
      captureButton.disabled = !cameraStream;
    }
  }

  startButton.addEventListener("click", startCamera);
  captureButton.addEventListener("click", captureAndDetect);
  stopButton.addEventListener("click", function () {
    stopCamera();
    setStatus("Camera stopped.");
  });
  window.addEventListener("pagehide", stopCamera);
}

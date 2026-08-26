export function normalizeWord(value, language = "en-IN") {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase(language)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

export function editDistance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 0; row < a.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < b.length; column += 1) {
      current.push(
        Math.min(
          current[column] + 1,
          previous[column + 1] + 1,
          previous[column] + (a[row] === b[column] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }

  return previous[b.length] ?? a.length;
}

export function soundsCorrect(transcript, targetWord, language = "en-IN") {
  const expected = normalizeWord(targetWord, language);
  const heard = normalizeWord(transcript, language);
  if (!expected || !heard) return false;
  if (expected === heard) return true;
  if (expected.length >= 3 && heard.includes(expected)) return true;

  const longest = Math.max(Array.from(expected).length, Array.from(heard).length);
  return longest > 0 && 1 - editDistance(expected, heard) / longest >= 0.86;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be captured."))),
      "image/jpeg",
      quality,
    );
  });
}

let activeCapturedImageUrl;

function releaseCapturedImage() {
  if (!activeCapturedImageUrl) return;
  URL.revokeObjectURL(activeCapturedImageUrl);
  activeCapturedImageUrl = undefined;
}

function showServerPage(html, capturedImageUrl) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (!parsed.body.childNodes.length) {
    throw new Error("The result page could not be displayed.");
  }

  const capturedImage = parsed.querySelector("[data-captured-image]");
  if (capturedImage && capturedImageUrl) {
    releaseCapturedImage();
    activeCapturedImageUrl = capturedImageUrl;
    capturedImage.src = capturedImageUrl;
  } else if (capturedImageUrl) {
    URL.revokeObjectURL(capturedImageUrl);
  }

  document.title = parsed.title || document.title;
  document.body.className = parsed.body.className;
  document.body.replaceChildren(...parsed.body.childNodes);
  window.history.replaceState(null, "", "/");
  window.scrollTo(0, 0);
  enhancePage();
}

function enhancePage() {
  const uploadForm = document.querySelector("[data-upload-form]");

  if (uploadForm && uploadForm.dataset.enhanced !== "true") {
    uploadForm.dataset.enhanced = "true";
    const stage = uploadForm.querySelector("[data-camera-stage]");
    const video = uploadForm.querySelector("[data-camera-video]");
    const canvas = uploadForm.querySelector("[data-camera-canvas]");
    const loading = uploadForm.querySelector("[data-camera-loading]");
    const openButton = uploadForm.querySelector("[data-camera-start]");
    const shutterButton = uploadForm.querySelector("[data-camera-capture]");
    const status = uploadForm.querySelector("[data-camera-status]");
    let cameraStream;
    let cameraStarting = false;

    function stopCamera() {
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = undefined;
      video.srcObject = null;
    }

    function setCameraStatus(message, kind = "") {
      status.textContent = message;
      status.className = `camera-status ${kind ? `is-${kind}` : ""}`.trim();
    }

    async function startCamera() {
      if (cameraStarting || cameraStream) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        loading.textContent = "Camera unavailable";
        openButton.hidden = true;
        setCameraStatus("Open this page in a current version of Safari or Chrome.", "error");
        return;
      }

      cameraStarting = true;
      openButton.hidden = true;
      loading.hidden = false;
      loading.textContent = "Opening camera…";
      setCameraStatus("Allow camera access when asked.");

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        video.srcObject = cameraStream;
        await video.play();
        loading.hidden = true;
        shutterButton.disabled = false;
        stage.classList.add("is-ready");
        setCameraStatus("Point at one object, then tap the shutter.", "ready");
      } catch (error) {
        stopCamera();
        loading.hidden = true;
        openButton.hidden = false;
        const blocked = error?.name === "NotAllowedError" || error?.name === "SecurityError";
        setCameraStatus(
          blocked
            ? "Tap Open camera and allow camera access."
            : "The camera could not open. Tap to try again.",
          "error",
        );
      } finally {
        cameraStarting = false;
      }
    }

    openButton.addEventListener("click", () => void startCamera());
    shutterButton.addEventListener("click", async () => {
      if (!cameraStream || uploadForm.dataset.busy === "true") return;
      uploadForm.dataset.busy = "true";
      shutterButton.disabled = true;
      let capturedImageUrl;

      try {
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("The camera is still starting. Please try again.");
        }
        const maxDimension = 1600;
        const scale = Math.min(1, maxDimension / video.videoWidth, maxDimension / video.videoHeight);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The camera frame could not be captured.");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const picture = await canvasToBlob(canvas, 0.86);
        capturedImageUrl = URL.createObjectURL(picture);

        canvas.hidden = false;
        video.hidden = true;
        stage.classList.add("is-captured");
        stopCamera();
        setCameraStatus("Finding the main object…", "loading");

        const body = new FormData(uploadForm);
        body.set("cameraImage", picture, "camera-picture.jpg");
        const response = await fetch(uploadForm.action, {
          method: "POST",
          body,
          headers: { accept: "text/html" },
        });
        showServerPage(await response.text(), capturedImageUrl);
      } catch (error) {
        if (capturedImageUrl && capturedImageUrl !== activeCapturedImageUrl) {
          URL.revokeObjectURL(capturedImageUrl);
        }
        stopCamera();
        uploadForm.dataset.busy = "false";
        canvas.hidden = true;
        video.hidden = false;
        stage.classList.remove("is-captured", "is-ready");
        openButton.hidden = false;
        setCameraStatus(
          error instanceof Error ? error.message : "The picture could not be completed.",
          "error",
        );
      }
    });

    window.addEventListener("pagehide", stopCamera, { once: true });
    void startCamera();
  }

  const card = document.querySelector("[data-pronunciation-card]");
  if (!card || card.dataset.enhanced === "true") return;
  card.dataset.enhanced = "true";

  const startButton = card.querySelector("[data-pronunciation-start]");
  const buttonLabel = card.querySelector("[data-pronunciation-label]");
  const feedback = card.querySelector("[data-pronunciation-feedback]");
  const resultAudio = card.querySelector("[data-result-audio]");
  const repeatButton = card.querySelector("[data-repeat-audio]");
  const targetWord = card.dataset.targetWord?.trim() || "";
  const language = card.dataset.language || "en-IN";
  const languageCode = language.split("-")[0].toLocaleLowerCase();
  let recorder;
  let recordingStream;
  let stopTimer;

  function setFeedback(kind, message) {
    feedback.className = `pronunciation-feedback ${kind ? `is-${kind}` : ""}`.trim();
    feedback.textContent = message;
  }

  async function playResultAudio() {
    resultAudio.currentTime = 0;
    await resultAudio.play();
  }

  repeatButton.addEventListener("click", () => {
    void playResultAudio().catch(() => undefined);
  });
  void playResultAudio().catch(() => undefined);

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    startButton.disabled = true;
    setFeedback(
      "unsupported",
      "This browser cannot record audio. Try a current version of Chrome or Safari.",
    );
    return;
  }

  function finishAttempt() {
    startButton.disabled = false;
    startButton.classList.remove("is-listening");
    buttonLabel.textContent = "Record again";
  }

  function closeMicrophone() {
    clearTimeout(stopTimer);
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = undefined;
  }

  async function checkRecording(audio) {
    startButton.disabled = true;
    buttonLabel.textContent = "Checking…";
    setFeedback("listening", "Checking what I heard…");

    try {
      const body = new FormData();
      const baseType = audio.type.split(";", 1)[0];
      const extension = baseType === "audio/mp4" ? "mp4" : baseType === "audio/ogg" ? "ogg" : "webm";
      body.set("audio", audio, `pronunciation.${extension}`);
      body.set("language", languageCode);

      const response = await fetch("/pronounce", {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The recording could not be checked.");

      const transcript = String(result.transcript || "").trim();
      if (soundsCorrect(transcript, targetWord, language)) {
        setFeedback("correct", `Great job! I heard “${transcript}”.`);
      } else {
        setFeedback("retry", `I heard “${transcript || "something different"}”. Listen once more, then try again.`);
      }
    } catch (error) {
      setFeedback(
        "retry",
        error instanceof Error ? error.message : "The recording could not be checked.",
      );
    } finally {
      finishAttempt();
    }
  }

  startButton.addEventListener("click", async () => {
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }

    startButton.disabled = true;
    setFeedback("listening", "Requesting microphone access…");

    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      const chunks = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener(
        "stop",
        () => {
          const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          closeMicrophone();
          void checkRecording(audio);
        },
        { once: true },
      );

      recorder.start(250);
      startButton.disabled = false;
      startButton.classList.add("is-listening");
      buttonLabel.textContent = "Stop recording";
      setFeedback("listening", `Recording now — say “${targetWord}”.`);
      stopTimer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 4_000);
    } catch (error) {
      closeMicrophone();
      const message =
        error?.name === "NotAllowedError"
          ? "Microphone permission was blocked. Allow microphone access in your browser settings and try again."
          : error?.name === "NotFoundError"
            ? "No microphone was found on this device."
            : "The microphone could not start. Please try again.";
      setFeedback("retry", message);
      finishAttempt();
    }
  });
}

if (typeof document !== "undefined") {
  window.addEventListener("pagehide", releaseCapturedImage, { once: true });
  enhancePage();
}

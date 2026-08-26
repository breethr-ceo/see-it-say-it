import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const STYLES_PATH = new URL("./public/styles.css", import.meta.url);
const APP_JS_PATH = new URL("./public/app.js", import.meta.url);
const FAVICON_PATH = new URL("./public/favicon.png", import.meta.url);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 128 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAYA_TTS_URL = "https://tts.mayaresearch.ai/v1/tts";
const MAYA_MODEL = "Maya 2 Native";

export const LANGUAGES = Object.freeze({
  ml: "Malayalam",
  hi: "Hindi",
  gu: "Gujarati",
  mr: "Marathi",
  en: "Indian English",
});

const LANGUAGE_LOCALES = Object.freeze({
  ml: "ml-IN",
  hi: "hi-IN",
  gu: "gu-IN",
  mr: "mr-IN",
  en: "en-IN",
});

const LANGUAGE_NATIVE_LABELS = Object.freeze({
  ml: "മലയാളം",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
  mr: "मराठी",
  en: "English",
});

export const VOICES = Object.freeze({
  Ananya: "Ananya · female",
});

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PublicError";
    this.status = status;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function languageChoiceMarkup(selected) {
  return Object.entries(LANGUAGES)
    .map(
      ([value, label]) => `
        <label class="language-option">
          <input type="radio" name="language" value="${escapeHtml(value)}"${value === selected ? " checked" : ""} required>
          <span>
            <strong lang="${escapeHtml(LANGUAGE_LOCALES[value])}">${escapeHtml(LANGUAGE_NATIVE_LABELS[value])}</strong>
            <small>${escapeHtml(label)}</small>
          </span>
        </label>`,
    )
    .join("");
}

function languagePickerMarkup(selected, { frozen = false } = {}) {
  return `
      <fieldset class="language-picker"${frozen ? " disabled data-language-frozen" : ""}>
        <legend>Choose a language</legend>
        <div class="language-options">
          ${languageChoiceMarkup(selected)}
        </div>
      </fieldset>`;
}

export function highlightObjectWord(sentence, objectName) {
  const source = String(sentence);
  const target = String(objectName).trim();
  if (!target) return escapeHtml(source);

  const index = source.toLocaleLowerCase().indexOf(target.toLocaleLowerCase());
  if (index < 0) return escapeHtml(source);

  return `${escapeHtml(source.slice(0, index))}<mark class="object-highlight">${escapeHtml(
    source.slice(index, index + target.length),
  )}</mark>${escapeHtml(source.slice(index + target.length))}`;
}

export function createLearningSentence(objectName, language) {
  const word = String(objectName).trim();
  if (language === "hi") return `यह एक ${word} है।`;
  if (language === "gu") return `આ એક ${word} છે.`;
  if (language === "mr") return `हे एक ${word} आहे.`;
  if (language === "en") {
    const article = /^[aeiou]/i.test(word) ? "an" : "a";
    return `This is ${article} ${word}.`;
  }
  return `ഇത് ഒരു ${word} ആണ്.`;
}

function renderForm({ selectedLanguage = "ml" } = {}) {
  return `
    <form class="experience" action="/identify" method="post" enctype="multipart/form-data" data-upload-form>
      <input type="hidden" name="voice" value="Ananya">

      ${languagePickerMarkup(selectedLanguage)}

      <div class="camera-stage" data-camera-stage>
        <video autoplay muted playsinline aria-label="Live rear camera" data-camera-video></video>
        <canvas data-camera-canvas hidden></canvas>
        <div class="camera-loading" data-camera-loading>Opening camera…</div>
        <button class="open-camera-button" type="button" data-camera-start hidden>Open camera</button>
        <button class="shutter-button" type="button" data-camera-capture aria-label="Take picture" disabled>
          <span></span>
        </button>
      </div>
      <p class="camera-status" data-camera-status aria-live="polite">Allow camera access when asked.</p>
    </form>`;
}

export function renderPage({ result, error, selectedLanguage = "ml" } = {}) {
  const languageLocale = LANGUAGE_LOCALES[selectedLanguage] ?? LANGUAGE_LOCALES.ml;
  const resultMarkup = result
    ? `
      <div class="experience result-experience">
        ${languagePickerMarkup(selectedLanguage, { frozen: true })}

        <div class="camera-stage result-camera-stage">
          <img class="captured-image" data-captured-image alt="The captured object">
          <section class="result-card" aria-labelledby="result-heading" data-pronunciation-card data-target-word="${escapeHtml(result.objectName)}" data-language="${escapeHtml(languageLocale)}">
            <div class="word-panel">
              <span class="result-label">Your word</span>
              <h2 id="result-heading" lang="${escapeHtml(languageLocale)}">${escapeHtml(result.objectName)}</h2>
              <p class="english-name"><span>English</span> ${escapeHtml(result.englishName)}</p>
              <p class="phonetic-spelling"><span>Say it</span> ${escapeHtml(result.phoneticSpelling)}</p>
              <p class="sentence" lang="${escapeHtml(languageLocale)}">${highlightObjectWord(result.sentence, result.objectName)}</p>
            </div>

            <audio preload="auto" data-result-audio src="data:audio/wav;base64,${result.audioBase64}"></audio>
            <button class="repeat-button" type="button" data-repeat-audio>
              <span aria-hidden="true">↻</span> Repeat again
            </button>

            <div class="practice-card">
              <strong>Now say <mark lang="${escapeHtml(languageLocale)}">${escapeHtml(result.objectName)}</mark></strong>
              <button class="microphone-button" type="button" data-pronunciation-start>
                <span class="microphone-icon" aria-hidden="true">🎙</span>
                <span data-pronunciation-label>Start recording</span>
              </button>
              <div class="pronunciation-feedback" data-pronunciation-feedback role="status" aria-live="polite">
                Ready when you are.
              </div>
              <noscript>Enable JavaScript to use the pronunciation check.</noscript>
            </div>
            <a class="secondary-button" href="/?language=${escapeHtml(selectedLanguage)}">Click again</a>
          </section>
        </div>
      </div>`
    : "";

  const errorMarkup = error
    ? `<div class="error-banner" role="alert"><strong>That did not work.</strong> ${escapeHtml(error)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#6842d8">
    <meta name="description" content="Take a photo, learn the word for its main object, and practise saying it in Malayalam, Hindi, Gujarati, Marathi, or Indian English.">
    <title>See It · Say It</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="apple-touch-icon" href="/favicon.png">
    <link rel="stylesheet" href="/styles.css?v=overlay-results">
    <script type="module" src="/app.js?v=overlay-results"></script>
  </head>
  <body class="camera-view${result ? " result-view" : ""}">
    <main class="page-shell">
      <section class="workspace" aria-label="Object identification form">
        ${errorMarkup}
        ${resultMarkup || renderForm({ selectedLanguage })}
      </section>
    </main>
  </body>
</html>`;
}

function requireApiKey(name, suppliedValue) {
  const value = suppliedValue ?? process.env[name];
  if (!value) {
    throw new PublicError(`The server is missing ${name}. Add it to the local .env file.`, 503);
  }
  return value;
}

function validateSelection(language, voice) {
  validateLanguage(language);
  if (!Object.hasOwn(VOICES, voice)) {
    throw new PublicError("Choose a supported Maya 2 Native voice.");
  }
}

function validateLanguage(language) {
  if (!Object.hasOwn(LANGUAGES, language)) {
    throw new PublicError("Choose a supported language.");
  }
}

function geminiGenerateContentUrl(model) {
  const modelId = String(model).trim().replace(/^models\//, "");
  if (!modelId) {
    throw new Error("A Gemini model name is required.");
  }
  return `${GEMINI_API_BASE_URL}/${encodeURIComponent(modelId)}:generateContent`;
}

function extractGeminiText(response) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  throw new Error("Gemini returned no text output.");
}

export function parseIdentification(response) {
  const parsed = JSON.parse(extractGeminiText(response));
  if (
    typeof parsed.objectName !== "string" ||
    !parsed.objectName.trim() ||
    typeof parsed.englishName !== "string" ||
    !parsed.englishName.trim() ||
    typeof parsed.phoneticSpelling !== "string" ||
    !parsed.phoneticSpelling.trim()
  ) {
    throw new Error("Gemini returned an incomplete identification.");
  }
  return {
    objectName: parsed.objectName.trim(),
    englishName: parsed.englishName.trim(),
    phoneticSpelling: parsed.phoneticSpelling.trim(),
  };
}

export async function identifyMainObject({
  imageBytes,
  mimeType,
  language,
  apiKey,
  model = process.env.GEMINI_VISION_MODEL || DEFAULT_GEMINI_MODEL,
  fetchImpl = fetch,
}) {
  const geminiKey = requireApiKey("GEMINI_API_KEY", apiKey);
  const languageName = LANGUAGES[language];
  const imageData = Buffer.from(imageBytes).toString("base64");

  const response = await fetchImpl(geminiGenerateContentUrl(model), {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey,
      "content-type": "application/json",
      "user-agent": "see-it-say-it/1.0",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Identify the single main physical object. Return its common singular name in ${languageName}, its English name, and an easy Latin-letter phonetic spelling of the ${languageName} word (no IPA). Use native script for Malayalam, Hindi, Gujarati, or Marathi. If unclear, use "unclear object" in both languages.`,
            },
            {
              inlineData: {
                mimeType,
                data: imageData,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 90,
        mediaResolution: "MEDIA_RESOLUTION_LOW",
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            objectName: { type: "string" },
            englishName: { type: "string" },
            phoneticSpelling: { type: "string" },
          },
          required: ["objectName", "englishName", "phoneticSpelling"],
          additionalProperties: false,
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const identification = parseIdentification(await response.json());
  return {
    ...identification,
    sentence: createLearningSentence(identification.objectName, language),
  };
}

export async function transcribeSpeech({
  audioBytes,
  mimeType,
  language,
  apiKey,
  model = process.env.GEMINI_TRANSCRIPTION_MODEL || DEFAULT_GEMINI_MODEL,
  fetchImpl = fetch,
}) {
  const geminiKey = requireApiKey("GEMINI_API_KEY", apiKey);
  const languageName = LANGUAGES[language];
  const locale = LANGUAGE_LOCALES[language];
  const audioData = Buffer.from(audioBytes).toString("base64");

  const response = await fetchImpl(geminiGenerateContentUrl(model), {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey,
      "content-type": "application/json",
      "user-agent": "see-it-say-it/1.0",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Transcribe exactly the one spoken word in ${languageName} (${locale}). Use the expected script and do not translate.`,
            },
            {
              inlineData: {
                mimeType,
                data: audioData,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 30,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            transcript: { type: "string" },
          },
          required: ["transcript"],
          additionalProperties: false,
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini transcription failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const result = JSON.parse(extractGeminiText(await response.json()));
  if (typeof result.transcript !== "string" || !result.transcript.trim()) {
    throw new Error("Gemini returned no transcription.");
  }
  return result.transcript.trim();
}

export function pcmToWav(pcmInput, sampleRate = 24_000, channels = 1) {
  const pcm = Buffer.from(pcmInput);
  const header = Buffer.alloc(44);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function synthesizeSpeech({
  text,
  language,
  voice,
  apiKey,
  fetchImpl = fetch,
}) {
  const mayaKey = requireApiKey("MAYA_API_KEY", apiKey);
  const response = await fetchImpl(MAYA_TTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${mayaKey}`,
      "content-type": "application/json",
      "user-agent": "see-it-say-it/1.0",
    },
    body: JSON.stringify({
      model: MAYA_MODEL,
      voice,
      language,
      text,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Maya request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const pcm = Buffer.from(await response.arrayBuffer());
  if (pcm.length < 2) {
    throw new Error("Maya returned an empty audio stream.");
  }
  return pcmToWav(pcm);
}

async function requestToWebRequest(request) {
  const host = request.headers.host || "localhost";
  const url = new URL(request.url || "/", `http://${host}`);
  const init = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request;
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function handleIdentify(request, response) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new PublicError("The upload is too large. Choose an image up to 4 MB.", 413);
  }

  const form = await (await requestToWebRequest(request)).formData();
  const language = String(form.get("language") || "");
  const voice = String(form.get("voice") || "");
  const image = form.get("cameraImage");
  validateSelection(language, voice);

  if (!(image instanceof File) || image.size === 0) {
    throw new PublicError("Choose an image to identify.");
  }
  if (image.size > MAX_IMAGE_BYTES) {
    throw new PublicError("The upload is too large. Choose an image up to 4 MB.", 413);
  }
  if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
    throw new PublicError("Use a JPG, PNG, WebP, or GIF image.");
  }

  const imageBytes = Buffer.from(await image.arrayBuffer());
  const identification = await identifyMainObject({
    imageBytes,
    mimeType: image.type,
    language,
  });
  const wav = await synthesizeSpeech({
    text: `${identification.objectName}. ${identification.sentence}`,
    language,
    voice,
  });

  const html = renderPage({
    selectedLanguage: language,
    selectedVoice: voice,
    result: {
      ...identification,
      audioBase64: wav.toString("base64"),
    },
  });
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function handlePronounce(request, response) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) {
    throw new PublicError("The recording is too large. Record one short word.", 413);
  }

  const form = await (await requestToWebRequest(request)).formData();
  const language = String(form.get("language") || "");
  const audio = form.get("audio");
  validateLanguage(language);

  if (!(audio instanceof File) || audio.size === 0) {
    throw new PublicError("No microphone recording was received.");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new PublicError("The recording is too large. Record one short word.", 413);
  }

  const mimeType = audio.type.split(";", 1)[0].toLocaleLowerCase();
  if (!ACCEPTED_AUDIO_TYPES.has(mimeType)) {
    throw new PublicError("This browser's recording format is not supported.");
  }

  const transcript = await transcribeSpeech({
    audioBytes: Buffer.from(await audio.arrayBuffer()),
    mimeType,
    language,
  });
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ transcript }));
}

export async function handleAppRequest(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  const vercelRoute = url.searchParams.get("__route");
  const pathname =
    vercelRoute === "home"
      ? "/"
      : vercelRoute === "identify"
        ? "/identify"
        : vercelRoute === "pronounce"
          ? "/pronounce"
          : url.pathname;

  try {
    if (request.method === "GET" && pathname === "/favicon.png") {
      const favicon = await readFile(FAVICON_PATH);
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      response.end(favicon);
      return;
    }

    if (request.method === "GET" && pathname === "/styles.css") {
      const css = await readFile(STYLES_PATH);
      response.writeHead(200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-cache",
      });
      response.end(css);
      return;
    }

    if (request.method === "GET" && pathname === "/app.js") {
      const script = await readFile(APP_JS_PATH);
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      });
      response.end(script);
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      const requestedLanguage = url.searchParams.get("language");
      const selectedLanguage = Object.hasOwn(LANGUAGES, requestedLanguage)
        ? requestedLanguage
        : "ml";
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderPage({ selectedLanguage }));
      return;
    }

    if (request.method === "POST" && pathname === "/identify") {
      await handleIdentify(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/pronounce") {
      await handlePronounce(request, response);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    const isPublic = error instanceof PublicError;
    const status = isPublic ? error.status : 502;
    const message = isPublic
      ? error.message
      : "The AI services could not finish this request. Please try again.";

    if (!isPublic) {
      console.error(error instanceof Error ? error.message : error);
    }

    if (!response.headersSent) {
      response.writeHead(status, {
        "content-type":
          pathname === "/pronounce"
            ? "application/json; charset=utf-8"
            : "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
    }
    response.end(
      pathname === "/pronounce"
        ? JSON.stringify({ error: message })
        : renderPage({ error: message }),
    );
  }
}

export function createAppServer() {
  return createServer(handleAppRequest);
}

function startServer() {
  const port = Number(process.env.PORT || 3001);
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`See It · Say It is ready at http://localhost:${port}`);
    console.log(`Serving files from ${APP_DIR}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { editDistance, normalizeWord, soundsCorrect } from "../public/app.js";
import vercelHandler from "../api/app.mjs";

import {
  createLearningSentence,
  createAppServer,
  highlightObjectWord,
  identifyMainObject,
  LANGUAGES,
  parseIdentification,
  pcmToWav,
  renderPage,
  synthesizeSpeech,
  transcribeSpeech,
  VOICES,
} from "../server.mjs";

test("Maya 2 Native settings match the documented roster", () => {
  assert.deepEqual(Object.keys(VOICES), ["Ananya"]);
  assert.deepEqual(Object.keys(LANGUAGES), ["kn", "ta", "gu", "mr", "ml"]);
});

test("the phone page opens a live rear camera with intuitive language choices", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<body class="camera-view">/);
  assert.equal((html.match(/type="radio" name="language"/g) || []).length, 5);
  assert.match(html, /type="hidden" name="voice" value="Ananya"/);
  assert.match(html, /<legend>Choose a language<\/legend>/);
  assert.doesNotMatch(html, /<header|See it\.|Take a picture|Ananya voice/);
  assert.doesNotMatch(html, /<select|Arjun|type="file"|galleryImage|camera roll/);
  assert.match(html, /<video autoplay muted playsinline/);
  assert.match(html, /data-camera-capture/);
  assert.match(html, /data-camera-start/);
  assert.match(html, /ಕನ್ನಡ|தமிழ்|ગુજરાતી|मराठी|മലയാളം/);
  assert.doesNotMatch(html, /language-strip|<footer/);
  assert.match(html, /<link rel="icon" type="image\/png" href="\/favicon\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/favicon\.png">/);
  assert.match(html, /<script type="module" src="\/app\.js\?v=openai-pronunciation"><\/script>/);
  assert.doesNotMatch(html, /Indian English|Hindi|हिन्दी|English<\/small>/);
});

test("the supplied PNG is served as the site favicon", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/favicon.png`);
  const image = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(image.subarray(1, 4).toString(), "PNG");
});

test("the Vercel function entry point reuses the application handler", async () => {
  assert.equal(typeof vercelHandler, "function");
});

test("the Vercel home rewrite resolves to the application page", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/app?__route=home`,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<legend>Choose a language<\/legend>/);
  assert.doesNotMatch(html, /<header|See it\.|Take a picture|Ananya voice/);
});

test("the browser script starts camera, replays audio, and records pronunciation", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/app.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/javascript/);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.doesNotMatch(script, /webkitSpeechRecognition/);
  assert.match(script, /getUserMedia/);
  assert.match(script, /MediaRecorder/);
  assert.match(script, /\/pronounce/);
  assert.match(script, /facingMode/);
  assert.match(script, /data-camera-capture/);
  assert.match(script, /cameraImage/);
  assert.match(script, /playResultAudio/);
  assert.match(script, /DOMParser/);
  assert.match(script, /replaceChildren/);
  assert.match(script, /document\.body\.className/);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /data-captured-image/);
  assert.doesNotMatch(script, /document\.write/);
  assert.match(script, /editDistance/);
  assert.match(script, /canvas\.toBlob/);
});

test("the stylesheet gives the camera a full-height iPhone surface with overlaid languages", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/styles.css`);
  const css = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.match(css, /width:\s*min\(100%, 430px\)/);
  assert.match(css, /\.page-shell[^}]+height:\s*100dvh/s);
  assert.match(css, /\.language-picker[^}]+position:\s*absolute/s);
  assert.match(css, /grid-template-columns:\s*repeat\(5,/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /\.language-picker\[disabled\][^}]+pointer-events:\s*none/s);
  assert.match(css, /\.result-card[^}]+position:\s*absolute[^}]+bottom:\s*0/s);
  assert.match(css, /\.result-card[^}]+rgba\(20, 16, 29, 0\.18\)/s);
  assert.doesNotMatch(css, /\.result-card[^}]+rgba\(20, 16, 29, 0\.82\)/s);
  assert.match(css, /\.pronunciation-feedback:empty\s*{[^}]+display:\s*none/s);
  assert.match(css, /\.captured-image/);
});

test("the Vercel pronunciation route validates audio uploads as JSON", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const form = new FormData();
  form.set("language", "gu");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/app?__route=pronounce`,
    { method: "POST", body: form },
  );
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.match(result.error, /recording/i);
});

test("the result exposes only a simple repeat button for generated speech", () => {
  const html = renderPage({
    selectedLanguage: "ta",
    result: {
      objectName: "பாட்டில்",
      englishName: "bottle",
      pronunciationGuide: "paa-ttil",
      sentence: "இது ஒரு பாட்டில்.",
      audioBase64: "UklGRg==",
    },
  });

  assert.match(html, /<audio preload="auto" data-result-audio/);
  assert.match(html, /data-repeat-audio/);
  assert.match(html, /Repeat again/);
  assert.match(html, /<body class="camera-view result-view">/);
  assert.match(html, /data-language-frozen/);
  assert.match(html, /data-captured-image/);
  assert.match(html, /English<\/span> bottle/);
  assert.match(html, /Say it<\/span> paa-ttil/);
  assert.match(html, /href="\/\?language=ta">Click again/);
  assert.doesNotMatch(html, /Ready when you are/);
  assert.doesNotMatch(html, /<audio controls|type="range"/);
});

test("click-again language query restores an editable selected language", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/?language=gu`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /name="language" value="gu" checked/);
  assert.doesNotMatch(html, /data-language-frozen/);
});

test("the object word is highlighted safely inside its sentence", () => {
  assert.equal(
    highlightObjectWord("இது ஒரு பாட்டில்.", "பாட்டில்"),
    'இது ஒரு <mark class="object-highlight">பாட்டில்</mark>.',
  );
  assert.equal(
    highlightObjectWord("A <cup> is here.", "<cup>"),
    'A <mark class="object-highlight">&lt;cup&gt;</mark> is here.',
  );
});

test("pronunciation comparison handles punctuation, near matches, and different words", () => {
  assert.equal(normalizeWord("  Bottle! ", "en-IN"), "bottle");
  assert.equal(editDistance("bottle", "bottel"), 2);
  assert.equal(soundsCorrect("Bottle.", "bottle", "en-IN"), true);
  assert.equal(soundsCorrect("I said bottle", "bottle", "en-IN"), true);
  assert.equal(soundsCorrect("battle", "bottle", "en-IN"), false);
  assert.equal(soundsCorrect("table", "bottle", "en-IN"), false);
  assert.equal(soundsCorrect("ಬಾಟಲಿ", "ಬಾಟಲಿ", "kn-IN"), true);
  assert.equal(soundsCorrect("பாட்டில்", "பாட்டில்", "ta-IN"), true);
  assert.equal(soundsCorrect("കപ്പ്", "കപ്പ്", "ml-IN"), true);
  assert.equal(soundsCorrect("બોટલ", "બોટલ", "gu-IN"), true);
  assert.equal(soundsCorrect("बाटली", "बाटली", "mr-IN"), true);
});

test("structured identification is parsed from an OpenAI response", () => {
  const result = parseIdentification({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              objectName: "பாட்டில்",
              englishName: "bottle",
              pronunciationGuide: "paa-ttil",
            }),
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    objectName: "பாட்டில்",
    englishName: "bottle",
    pronunciationGuide: "paa-ttil",
  });
});

test("short local templates always reuse the identified word", () => {
  assert.equal(createLearningSentence("ಬಾಟಲಿ", "kn"), "ಇದು ಒಂದು ಬಾಟಲಿ.");
  assert.equal(createLearningSentence("பாட்டில்", "ta"), "இது ஒரு பாட்டில்.");
  assert.equal(createLearningSentence("બોટલ", "gu"), "આ એક બોટલ છે.");
  assert.equal(createLearningSentence("बाटली", "mr"), "हे एक बाटली आहे.");
  assert.equal(createLearningSentence("കപ്പ്", "ml"), "ഇത് ഒരു കപ്പ് ആണ്.");
});

test("OpenAI transcription sends short audio with the selected language", async () => {
  let requestedUrl;
  let requestInit;
  const transcript = await transcribeSpeech({
    audioBytes: Buffer.from([1, 2, 3, 4]),
    mimeType: "audio/webm",
    language: "ta",
    apiKey: "test-openai-key",
    model: "test-transcription-model",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestInit = init;
      return Response.json({ text: "பாட்டில்" });
    },
  });

  assert.equal(
    requestedUrl,
    "https://api.openai.com/v1/audio/transcriptions",
  );
  assert.equal(requestInit.headers.authorization, "Bearer test-openai-key");
  assert.equal(requestInit.headers["content-type"], undefined);
  assert.ok(requestInit.body instanceof FormData);
  assert.equal(requestInit.body.get("model"), "test-transcription-model");
  assert.equal(requestInit.body.get("language"), "ta");
  assert.equal(requestInit.body.get("response_format"), "json");
  assert.match(requestInit.body.get("prompt"), /Tamil \(ta-IN\)/);
  const audioFile = requestInit.body.get("file");
  assert.ok(audioFile instanceof File);
  assert.equal(audioFile.name, "pronunciation.webm");
  assert.equal(audioFile.type, "audio/webm");
  assert.deepEqual(Buffer.from(await audioFile.arrayBuffer()), Buffer.from([1, 2, 3, 4]));
  assert.equal(transcript, "பாட்டில்");
});

test("OpenAI identification minimizes output and image tokens", async () => {
  let requestedUrl;
  let requestInit;
  let requestBody;
  const result = await identifyMainObject({
    imageBytes: Buffer.from([1, 2, 3]),
    mimeType: "image/png",
    language: "ml",
    apiKey: "test-openai-key",
    model: "test-vision-model",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestInit = init;
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    objectName: "കപ്പ്",
                    englishName: "cup",
                    pronunciationGuide: "kapp",
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(
    requestedUrl,
    "https://api.openai.com/v1/responses",
  );
  assert.equal(requestInit.headers.authorization, "Bearer test-openai-key");
  assert.equal(requestBody.model, "test-vision-model");
  assert.equal(requestBody.store, false);
  assert.deepEqual(requestBody.reasoning, { effort: "none" });
  assert.equal(requestBody.max_output_tokens, 90);
  assert.match(requestBody.instructions, /syllable by syllable/);
  assert.match(requestBody.instructions, /must not be the English translation/);
  assert.equal(requestBody.input[0].content[1].type, "input_image");
  assert.equal(requestBody.input[0].content[1].detail, "low");
  assert.equal(requestBody.input[0].content[1].image_url, "data:image/png;base64,AQID");
  assert.equal(result.sentence, "ഇത് ഒരു കപ്പ് ആണ്.");
  assert.equal(result.englishName, "cup");
  assert.equal(result.pronunciationGuide, "kapp");
  assert.deepEqual(requestBody.text.format.schema.required, [
    "objectName",
    "englishName",
    "pronunciationGuide",
  ]);
});

test("Maya request uses Maya 2 Native and raw PCM is wrapped as WAV", async () => {
  let requestBody;
  const wav = await synthesizeSpeech({
    text: "ಇದು ಒಂದು ಪುಸ್ತಕ.",
    language: "kn",
    voice: "Ananya",
    apiKey: "test-maya-key",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(Buffer.from([0, 0, 1, 0]), {
        status: 200,
        headers: { "content-type": "audio/L16; rate=24000; channels=1" },
      });
    },
  });

  assert.deepEqual(requestBody, {
    model: "Maya 2 Native",
    voice: "Ananya",
    language: "kn",
    text: "ಇದು ಒಂದು ಪುಸ್ತಕ.",
  });
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(22), 1);
});

test("PCM conversion writes a correct data length", () => {
  const wav = pcmToWav(Buffer.alloc(96));
  assert.equal(wav.length, 140);
  assert.equal(wav.readUInt32LE(40), 96);
});

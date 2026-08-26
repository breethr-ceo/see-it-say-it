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
  assert.deepEqual(Object.keys(LANGUAGES), ["ml", "hi", "gu", "mr", "en"]);
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
  assert.equal((html.match(/type="radio" name="language"/g) || []).length, 5);
  assert.match(html, /type="hidden" name="voice" value="Ananya"/);
  assert.doesNotMatch(html, /<select|Arjun|type="file"|galleryImage|camera roll/);
  assert.match(html, /<video autoplay muted playsinline/);
  assert.match(html, /data-camera-capture/);
  assert.match(html, /data-camera-start/);
  assert.match(html, /മലയാളം|हिन्दी|ગુજરાતી|मराठी|English/);
  assert.doesNotMatch(html, /language-strip|<footer/);
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /Telugu|Bengali|Kannada|Odia|Punjabi|Tamil/);
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
  assert.match(html, /See it\. <em>Say it\.<\/em>/);
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
  assert.doesNotMatch(script, /document\.write/);
  assert.match(script, /editDistance/);
  assert.match(script, /canvas\.toBlob/);
});

test("the stylesheet is constrained to a modern iPhone-width viewport", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/styles.css`);
  const css = await response.text();

  assert.equal(response.status, 200);
  assert.match(css, /width:\s*min\(100%, 430px\)/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /safe-area-inset-top/);
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
    selectedLanguage: "en",
    result: {
      objectName: "bottle",
      sentence: "This is a bottle.",
      audioBase64: "UklGRg==",
    },
  });

  assert.match(html, /<audio preload="auto" data-result-audio/);
  assert.match(html, /data-repeat-audio/);
  assert.match(html, /Repeat again/);
  assert.doesNotMatch(html, /<audio controls|type="range"/);
});

test("the object word is highlighted safely inside its sentence", () => {
  assert.equal(
    highlightObjectWord("यह एक बोतल है।", "बोतल"),
    'यह एक <mark class="object-highlight">बोतल</mark> है।',
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
  assert.equal(soundsCorrect("बोतल", "बोतल", "hi-IN"), true);
  assert.equal(soundsCorrect("കപ്പ്", "കപ്പ്", "ml-IN"), true);
  assert.equal(soundsCorrect("બોટલ", "બોટલ", "gu-IN"), true);
  assert.equal(soundsCorrect("बाटली", "बाटली", "mr-IN"), true);
});

test("structured identification is parsed from a Responses API message", () => {
  const result = parseIdentification({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              objectName: "बोतल",
            }),
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    objectName: "बोतल",
  });
});

test("short local templates always reuse the identified word", () => {
  assert.equal(createLearningSentence("കപ്പ്", "ml"), "ഇത് ഒരു കപ്പ് ആണ്.");
  assert.equal(createLearningSentence("बोतल", "hi"), "यह एक बोतल है।");
  assert.equal(createLearningSentence("બોટલ", "gu"), "આ એક બોટલ છે.");
  assert.equal(createLearningSentence("बाटली", "mr"), "हे एक बाटली आहे.");
  assert.equal(createLearningSentence("apple", "en"), "This is an apple.");
  assert.equal(createLearningSentence("bottle", "en"), "This is a bottle.");
});

test("OpenAI transcription sends a short audio file with the selected language", async () => {
  let requestedUrl;
  let requestInit;
  const transcript = await transcribeSpeech({
    audioBytes: Buffer.from([1, 2, 3, 4]),
    mimeType: "audio/webm",
    language: "gu",
    apiKey: "test-openai-key",
    model: "test-transcription-model",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestInit = init;
      return Response.json({ text: "બોટલ" });
    },
  });

  assert.equal(requestedUrl, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(requestInit.headers.authorization, "Bearer test-openai-key");
  assert.equal(requestInit.headers["content-type"], undefined);
  assert.ok(requestInit.body instanceof FormData);
  assert.equal(requestInit.body.get("model"), "test-transcription-model");
  assert.equal(requestInit.body.get("language"), "gu");
  assert.equal(requestInit.body.get("response_format"), "json");
  const file = requestInit.body.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.name, "pronunciation.webm");
  assert.equal(file.type, "audio/webm");
  assert.equal(file.size, 4);
  assert.equal(transcript, "બોટલ");
});

test("OpenAI request minimizes reasoning, output, prompt, and image tokens", async () => {
  let requestBody;
  const result = await identifyMainObject({
    imageBytes: Buffer.from([1, 2, 3]),
    mimeType: "image/png",
    language: "ml",
    apiKey: "test-openai-key",
    model: "test-vision-model",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            objectName: "കപ്പ്",
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(requestBody.model, "test-vision-model");
  assert.equal(requestBody.store, false);
  assert.deepEqual(requestBody.reasoning, { effort: "none" });
  assert.equal(requestBody.max_output_tokens, 50);
  assert.equal(requestBody.text.verbosity, "low");
  assert.match(requestBody.input[0].content[0].text, /Malayalam/);
  assert.ok(requestBody.input[0].content[0].text.length < 50);
  assert.equal(requestBody.input[0].content[1].detail, "low");
  assert.match(requestBody.input[0].content[1].image_url, /^data:image\/png;base64,/);
  assert.equal(result.sentence, "ഇത് ഒരു കപ്പ് ആണ്.");
  assert.deepEqual(requestBody.text.format.schema.required, ["objectName"]);
});

test("Maya request uses Maya 2 Native and raw PCM is wrapped as WAV", async () => {
  let requestBody;
  const wav = await synthesizeSpeech({
    text: "यह एक किताब है।",
    language: "hi",
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
    language: "hi",
    text: "यह एक किताब है।",
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

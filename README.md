# See It · Say It

Live test site: [https://see-it-say-it.vercel.app](https://see-it-say-it.vercel.app)

A deliberately small webpage that:

1. opens the phone's rear camera behind five tappable language choices and a large shutter button;
2. uses Gemini to identify only the main object and return its chosen-language name, English name, and simple Latin-letter pronunciation;
3. freezes the language strip and overlays the learning result on the captured photo;
4. builds and highlights a short local sentence containing the object's word in Malayalam, Hindi, Gujarati, Marathi, or Indian English;
5. uses the fixed Ananya voice in Maya 2 Native to speak the word and sentence;
6. records the learner's repetition, transcribes it with Gemini, and checks the pronunciation; and
7. returns to the live camera with the selected language restored when the learner taps `Click again`.

The browser receives HTML, CSS, a small interaction script, and WAV audio. Neither API key is sent to the browser.

## Requirements

- Node.js 22.13 or newer
- a Gemini API key with access to a model that accepts both image and audio input
- a Maya Research API key

## Setup

Copy `.env.example` to `.env`, then fill in both keys:

```bash
cp .env.example .env
```

Do not commit `.env`. The supplied `.gitignore` excludes it.

Start the example:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

No dependency installation is required. The example uses Node's built-in HTTP server, Fetch API, multipart form parsing, and test runner.

## Deploy to Vercel

The example includes a Vercel Function entry point and routing configuration. The local `.env` file is not uploaded or changed by deployment.

### Option A: Vercel CLI

Run these commands from the repository directory:

```bash
vercel login
vercel link
```

Add the two required secrets to both the Preview and Production environments. The CLI asks for each value without putting it in the project files:

```bash
vercel env add GEMINI_API_KEY preview
vercel env add MAYA_API_KEY preview
vercel env add GEMINI_API_KEY production
vercel env add MAYA_API_KEY production
```

If you set `GEMINI_VISION_MODEL` or `GEMINI_TRANSCRIPTION_MODEL` locally, add those optional values to Vercel as well. Create and verify a shareable preview first:

```bash
npm run deploy:preview
vercel curl /
```

Then publish the tested version to the project's production URL:

```bash
npm run deploy:production
```

### Option B: Vercel Git integration

Import the repository in the Vercel dashboard and leave **Root Directory** at the repository root. Add `GEMINI_API_KEY` and `MAYA_API_KEY` under Project Settings → Environment Variables for Preview and Production. Vercel will create preview URLs for branches and deploy the production branch to the public project URL.

### Hosted behavior and limits

- API keys remain in the Vercel Function and are never sent to the browser.
- Phone camera pictures larger than the safe upload size are resized to a maximum dimension of 1600 pixels before analysis.
- The server accepts images up to 4 MB, leaving room under Vercel Functions' 4.5 MB request limit.
- The function allows up to 300 seconds for the external AI calls on Vercel's current Fluid Compute defaults.
- Camera and microphone permissions require the HTTPS URL supplied by Vercel. First-time visitors must accept the browser permission prompts; if automatic camera startup is restricted, the page provides an `Open camera` fallback button.
- The generated WAV response and short pronunciation recording are not stored by the application.

## Configuration

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `GEMINI_API_KEY` | yes | — | Server-side Gemini authentication |
| `MAYA_API_KEY` | yes | — | Server-side Maya authentication |
| `GEMINI_VISION_MODEL` | no | `gemini-3.5-flash-lite` | Gemini model used for main-object identification |
| `GEMINI_TRANSCRIPTION_MODEL` | no | `gemini-3.5-flash-lite` | Gemini model used for short pronunciation transcription |
| `PORT` | no | `3001` | Local HTTP port |

Put the Gemini API key and model IDs in the local `.env` file at the repository root, next to `server.mjs`. The corresponding template is `.env.example`:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
MAYA_API_KEY=your_existing_maya_api_key
GEMINI_VISION_MODEL=gemini-3.5-flash-lite
GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-flash-lite
PORT=3001
```

The same Gemini model can handle both actions. The two model variables are separate so either one can be changed later without changing application code. Model IDs may be written as `gemini-3.5-flash-lite` or `models/gemini-3.5-flash-lite`; the server accepts both forms. Do not put any API key in `public/app.js` or other browser code.

The Maya engine is fixed to `Maya 2 Native` and the voice is fixed to `Ananya`. The interface is intentionally limited to Malayalam, Hindi, Gujarati, Marathi, and Indian English.

Maya returns headerless 24 kHz, 16-bit little-endian mono PCM. The server adds a WAV header and the result page exposes only a `Repeat again` playback button rather than native audio controls.

Pronunciation checking records up to four seconds with the browser's `MediaRecorder`, then uploads that clip to the server for Gemini transcription. Each attempt makes one small additional Gemini API request. Microphone access requires user permission and a secure HTTPS page outside local development.

The vision request asks Gemini for only the translated word, English name, and a short phonetic spelling, uses low media resolution, and limits structured output to 90 tokens. The short practice sentence is created locally from a language template, reducing output tokens and guaranteeing that the highlighted word appears exactly in the sentence. Pronunciation transcription uses inline audio and limits structured output to 30 tokens.

## Tests

```bash
npm test
```

Tests mock all external APIs, so they never spend API credits and do not need credentials.

## Deployment and latency

Keep the server between the browser and both AI APIs. Never move either key into frontend code.

Maya advises measuring latency from a deployed server rather than a laptop. Deploy near the inference region used for your traffic, then record server-to-server time for the `POST https://tts.mayaresearch.ai/v1/tts` call. Local development is suitable for functional testing but not latency benchmarking.

## Privacy notes

- The captured camera picture is held in memory for the duration of one request and is not written to disk.
- The camera picture and microphone recording are held in memory, sent to Gemini for analysis, and are not saved by this application.
- Gemini free-tier data handling is governed by Google's current Gemini API terms; obtain tester consent before sending photos or voice recordings.
- The result page is sent with `Cache-Control: no-store`.
- Production deployments should also set request-size limits at their proxy or platform edge.

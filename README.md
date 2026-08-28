# See It · Say It

Live test site: [https://see-it-say-it.vercel.app](https://see-it-say-it.vercel.app)

A deliberately small webpage that:

1. opens the phone's rear camera behind five tappable language choices and a large shutter button;
2. uses OpenAI vision to identify only the main object and return its chosen-language name, English name, and syllable-by-syllable Latin-letter pronunciation guide;
3. freezes the language strip and overlays the learning result on the captured photo;
4. builds and highlights a short local sentence containing the object's word in Kannada, Tamil, Gujarati, Marathi, or Malayalam;
5. uses the fixed Ananya voice in Maya 2 Native to speak the word and sentence;
6. records the learner's repetition, transcribes it with OpenAI, and checks the pronunciation; and
7. returns to the live camera with the selected language restored when the learner taps `Click again`.

The browser receives HTML, CSS, a small interaction script, and WAV audio. Neither API key is sent to the browser.

The supplied chat-bubble artwork is installed with a transparent outer background as the browser favicon, Apple touch icon, and web-app manifest icon. Source and generated sizes live in `public/app-icon.png`, `public/app-icon-512.png`, `public/app-icon-192.png`, `public/apple-touch-icon.png`, `public/favicon-32.png`, and `public/favicon-16.png`.

## Requirements

- Node.js 22.13 or newer
- an OpenAI API key with available API credits
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
vercel env add OPENAI_API_KEY preview
vercel env add MAYA_API_KEY preview
vercel env add OPENAI_API_KEY production
vercel env add MAYA_API_KEY production
```

If you set `OPENAI_VISION_MODEL` or `OPENAI_TRANSCRIPTION_MODEL` locally, add those optional values to Vercel as well. Create and verify a shareable preview first:

```bash
npm run deploy:preview
vercel curl /
```

Then publish the tested version to the project's production URL:

```bash
npm run deploy:production
```

### Option B: Vercel Git integration

Import the repository in the Vercel dashboard and leave **Root Directory** at the repository root. Add `OPENAI_API_KEY` and `MAYA_API_KEY` under Project Settings → Environment Variables for Preview and Production. Vercel will create preview URLs for branches and deploy the production branch to the public project URL.

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
| `OPENAI_API_KEY` | yes | — | Server-side OpenAI authentication |
| `MAYA_API_KEY` | yes | — | Server-side Maya authentication |
| `OPENAI_VISION_MODEL` | no | `gpt-5.6-luna` | OpenAI model used for main-object identification and translation |
| `OPENAI_TRANSCRIPTION_MODEL` | no | `gpt-4o-mini-transcribe` | OpenAI model used for short pronunciation transcription |
| `PORT` | no | `3001` | Local HTTP port |

Put the OpenAI API key and model IDs in the local `.env` file at the repository root, next to `server.mjs`. The corresponding template is `.env.example`:

```dotenv
OPENAI_API_KEY=your_openai_api_key
MAYA_API_KEY=your_existing_maya_api_key
OPENAI_VISION_MODEL=gpt-5.6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
PORT=3001
```

The model variables are separate so vision and transcription can be changed independently without editing application code. Do not put any API key in `public/app.js` or other browser code.

The Maya engine is fixed to `Maya 2 Native` and the voice is fixed to `Ananya`. The interface is intentionally limited to Kannada, Tamil, Gujarati, Marathi, and Malayalam.

Maya returns headerless 24 kHz, 16-bit little-endian mono PCM. The server adds a WAV header and the result page exposes only a `Repeat again` playback button rather than native audio controls.

Pronunciation checking records up to four seconds with the browser's `MediaRecorder`, then uploads that clip to the server for OpenAI transcription. Each attempt makes one small additional OpenAI API request. Microphone access requires user permission and a secure HTTPS page outside local development.

The vision request asks OpenAI for only the translated word, English name, and a simple Latin-letter pronunciation guide with explicit syllable breaks. It uses low image detail, disables response storage, and caps structured output at 90 tokens. The short practice sentence is created locally from a language template, reducing output tokens and guaranteeing that the highlighted word appears exactly in the sentence. Pronunciation audio is sent as a short multipart upload to OpenAI's transcription endpoint.

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
- The camera picture and microphone recording are held in memory, sent to OpenAI for analysis, and are not saved by this application.
- OpenAI API data handling is governed by OpenAI's current API terms; obtain tester consent before sending photos or voice recordings.
- The result page is sent with `Cache-Control: no-store`.
- Production deployments should also set request-size limits at their proxy or platform edge.

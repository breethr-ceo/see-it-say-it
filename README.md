# See It · Say It

Live test site: [https://see-it-say-it.vercel.app](https://see-it-say-it.vercel.app)

A deliberately small webpage that:

1. offers five tappable language choices and uses the fixed Ananya voice;
2. requests the phone's rear camera as soon as the page opens and shows a full-height camera view with overlaid language controls and a shutter button;
3. uses the OpenAI Responses API to identify only the main object;
4. builds and highlights a short local sentence containing the object's word in Malayalam, Hindi, Gujarati, Marathi, or Indian English;
5. uses Maya 2 Native to speak the word and a short sentence; and
6. records the learner's repetition, transcribes it with OpenAI, and checks the pronunciation.

The browser receives HTML, CSS, a small interaction script, and WAV audio. Neither API key is sent to the browser.

## Requirements

- Node.js 22.13 or newer
- an OpenAI API key with access to an image-capable Responses API model and audio transcription
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
| `OPENAI_VISION_MODEL` | no | `gpt-5.6-luna` | Image-capable Responses API model |
| `OPENAI_TRANSCRIPTION_MODEL` | no | `gpt-4o-mini-transcribe` | Short pronunciation transcription |
| `PORT` | no | `3001` | Local HTTP port |

The Maya engine is fixed to `Maya 2 Native` and the voice is fixed to `Ananya`. The interface is intentionally limited to Malayalam, Hindi, Gujarati, Marathi, and Indian English.

Maya returns headerless 24 kHz, 16-bit little-endian mono PCM. The server adds a WAV header and the result page exposes only a `Repeat again` playback button rather than native audio controls.

Pronunciation checking records up to four seconds with the browser's `MediaRecorder`, then uploads that clip to the server for OpenAI transcription. Each attempt makes one small additional OpenAI API request. Microphone access requires user permission and a secure HTTPS page outside local development.

The vision request asks AI for only one translated object word. The short practice sentence is created locally from a language template, reducing output tokens and guaranteeing that the highlighted word appears exactly in the sentence.

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
- The microphone recording is held in memory, sent to OpenAI for transcription, and is not saved by this application.
- The OpenAI request sets `store: false`.
- The result page is sent with `Cache-Control: no-store`.
- Production deployments should also set request-size limits at their proxy or platform edge.

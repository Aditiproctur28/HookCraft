# HookCraft — Learning Guide

A complete, learning-oriented tour of every technology in this project: **what it is, what it does here, and how it works.** Read top to bottom the first time; after that, jump to whatever section you're working in.

> **What HookCraft is:** an AI faceless-video generator. You type a topic (e.g. "history of the India Gate"), and it auto-produces a finished MP4 with an AI script, AI images, AI voiceover, animated captions, and smooth transitions — all on a **$0 runtime budget** (only free APIs and local tools).

---

## Table of Contents
1. [The Big Picture (Architecture)](#1-the-big-picture-architecture)
2. [Backend Technologies](#2-backend-technologies)
3. [The AI / External Services](#3-the-ai--external-services)
4. [Video Rendering with Remotion](#4-video-rendering-with-remotion)
5. [Frontend Technologies](#5-frontend-technologies)
6. [End-to-End Flow](#6-end-to-end-flow)
7. [Key Patterns You Should Recognize](#7-key-patterns-you-should-recognize)
8. [Suggested Learning Order](#8-suggested-learning-order)
9. [Glossary](#9-glossary)

---

## 1. The Big Picture (Architecture)

HookCraft is a classic **client–server web app** in two folders:

| Folder | Role | Core Tech |
|--------|------|-----------|
| `backend/` | The "brain" — calls AI APIs, renders the video | **Node.js + Express** |
| `frontend/` | The UI you click in the browser | **React + Vite + Tailwind** |

They communicate over **HTTP (a REST API)** plus a live **SSE progress stream**. The backend does all the heavy lifting; the frontend sends requests and shows progress.

The core idea: **one button kicks off a multi-step "pipeline"** that chains five steps — script → character → images → voiceover → render.

```
┌────────────┐   HTTP POST /api/video/generate    ┌─────────────────┐
│  Frontend  │ ─────────────────────────────────► │     Backend     │
│ (React UI) │                                     │   (Express)     │
│            │ ◄───── SSE live progress ────────── │                 │
└────────────┘   GET /api/video/progress/:jobId    └────────┬────────┘
                                                            │ pipeline
            ┌───────────────────────────────────────────────┼──────────────┐
            ▼                ▼                ▼               ▼              ▼
        Gemini           FLUX img         Edge TTS        Remotion       Job store
       (script)         (pictures)       (voiceover)      (MP4)         (progress)
```

---

## 2. Backend Technologies

### Node.js
The runtime that lets JavaScript run **outside the browser** (on a server). Everything in `backend/` is Node. The project uses **ES Modules** (`import`/`export`), enabled by `"type": "module"` in `backend/package.json`.

### Express — `backend/server.js`
**What it is:** the most popular web-server framework for Node.

**What it does here:** listens on a port (default 3001) and defines **routes** (URLs the frontend can call), plus serves generated files (images, audio, MP4) statically.

**How it works:**
- `app.use(cors())` — lets the browser frontend (a different origin) call the API.
- `app.use(express.json())` — parses incoming JSON request bodies.
- `app.use('/jobs', express.static(...))` — exposes generated files as downloadable URLs.
- `app.use('/api/video', videoRoutes)` — mounts a **router** (a group of related routes).
- `app.listen(PORT, ...)` — starts the server.

Think of Express as a **switchboard**: a URL comes in, Express routes it to the right function (a "controller").

### The Async Job Pattern — `backend/jobs/`
This is the **most important architectural idea** in the project. Generating a video takes 1–2 minutes — far too long for one HTTP request (the browser would time out). The solution: start the work in the background, return an ID instantly, and stream progress.

**`jobs/jobStore.js`** — an in-memory registry (a JavaScript `Map`) of "jobs."
- A **job** is an object tracking `status`, `stage`, `pct` (percent), `message`, the script data, etc.
- `createJob()` returns instantly with a unique `id` (`randomUUID()`).
- Each job carries a Node **`EventEmitter`** (a publish/subscribe object). When the job changes, it `emit`s an `'update'` event that the SSE stream is listening for.
- `snapshot(job)` produces a safe, serializable view — it drops the emitter and any internal field starting with `_` (like `_scriptData`) before sending to the browser.
- `updateJob(id, patch)` merges new data into the job **and** emits the update. This single function is how progress flows out.

**`jobs/pipeline.js`** — the actual workflow, deliberately split into two phases around a human-approval pause:
- **`runPreparation`** → generate the script (Gemini) + a character portrait (FLUX), then **pause** at status `awaiting_approval`.
- **`regenerateCharacter`** → make a new portrait with a fresh random seed (the "Regenerate" button).
- **`runProduction`** → after you approve, loop every scene to make its image + voiceover, then render the MP4.

These are **"fire-and-forget"**: the controller calls them *without* `await`, so the HTTP response returns immediately while the work continues in the background. Each step calls `updateJob()` to push progress. Both functions are wrapped in `try/catch` and **never throw** — failures become an `error` status the UI can show.

> **Note (`narrator` mode):** there's no on-screen character, so `runPreparation` skips the approval pause and goes straight to `runProduction`.

### SSE — Server-Sent Events — `controllers/videoController.js` (`streamProgress`)
**What it is:** a web standard where the **server pushes** a continuous stream of updates to the browser over one long-lived HTTP connection. Simpler than WebSockets and one-directional (server → client), which is exactly what a progress bar needs.

**How it works here:**
- Responds with `Content-Type: text/event-stream` and keeps the connection open.
- Immediately sends the current job snapshot, then subscribes to the job's emitter; every `updateJob` writes a new `data: {...}` line to the stream.
- A **heartbeat** (`: ping` every 25s) keeps the connection alive during the long approval pause.
- Closes the stream when status becomes `done` or `error`, and cleans up the listener if the browser disconnects (`req.on('close', ...)`).

### Controllers & Routes — `backend/controllers/`, `backend/routes/`
- **Routes** (`routes/videoRoutes.js`) map URLs to controller functions:
  - `POST /api/video/generate` → `startVideo`
  - `POST /api/video/:jobId/regenerate-character` → `regenerateCharacterHandler`
  - `POST /api/video/:jobId/approve` → `approveHandler`
  - `GET  /api/video/progress/:jobId` → `streamProgress` (the SSE stream)
- **Controllers** (`controllers/videoController.js`) are the functions that handle each request: validate input, kick off the pipeline, and respond. Note they return HTTP **202 Accepted** ("I've started, check back via SSE") rather than 200, which is the correct status for async work.

---

## 3. The AI / External Services

The pipeline chains **four free services**. None require paid plans.

### a) Script — Google Gemini — `services/geminiService.js`
**What it is:** Google's LLM, via the `@google/genai` SDK, model **`gemini-2.5-flash`** (fast + generous free tier).

**What it does:** turns your topic into a *structured* script — scenes with narration text, the speaking voice's gender, and an image prompt per scene.

**How it does it (the clever parts):**
- **Structured output via JSON schema** (`responseSchema` + `responseMimeType: "application/json"`): you *force* Gemini to return strict JSON matching your `scriptSchema`. The rest of the code can then rely on `script.scenes[i].narration_text` always existing — no fragile text parsing.
- **System instructions** are "director's rules" that solve real AI failure modes:
  - **Character consistency** — the *visual anchor* trick: describe the character identically in every scene's prompt so the image model keeps them looking the same.
  - **Anti-hallucination** — explicitly banning "two-shot / group / couple" so a solo monologue doesn't sprout extra people.
  - **Static-image rule** — no motion verbs, because the prompt feeds a *still*-image generator.
- **Modes you built** (selected by flags):
  - `narrator` — B-roll voiceover with no character (`NARRATOR_SYSTEM_INSTRUCTION`).
  - `verbatim` — use the user's exact words word-for-word (`VERBATIM_CLAUSE`).
  - Hindi — narration in Devanagari, but image prompts stay English (`HINDI_CLAUSE`).
- Wrapped in `withRetry(...)` for free-tier resilience (see below).

### b) Images — FLUX via a pluggable provider chain — `services/imageProviders.js` + `services/imageService.js`
**What it is:** **FLUX.1-schnell**, an open-source text-to-image model, accessed through free APIs.

**The pattern you built — fallback chain:** each provider is a function with `.providerName` and `.isAvailable()`:
- **Cloudflare Workers AI** — FLUX.1-schnell, ~230 images/day free, returns base64.
- **Pollinations.ai** — free Flux, supports exact width/height + seed.
- **Hugging Face** — optional, monthly-metered (kept out of the default order).

`imageService.generateSceneImage()` tries providers **in order** (set by `IMAGE_PROVIDERS` in `.env`, default `cloudflare,pollinations`). If one fails or is out of free quota, it falls through to the next. This is a **redundancy/resilience pattern** so you never depend on a single free service.

**The seed trick:** a "seed" is a number that makes image generation reproducible. You lock **one seed** across all scenes so the AI art stays visually consistent. "Regenerate" simply rolls a new random seed.

> FLUX prompts are enhanced with a quality suffix (`professional digital art, cinematic lighting, highly detailed, 8k resolution`) before sending.

### c) Voiceover — Microsoft Edge TTS — `services/audioService.js`
**What it is:** `msedge-tts` — free neural text-to-speech (the same voices Edge browser uses). No key, no cost.

**What it does:** converts each scene's narration into an MP3, choosing a voice by **language + gender** (`en-US-GuyNeural`, `hi-IN-SwaraNeural`, …).

**The clever bit — audio drives video timing:** after writing the MP3, it uses **`music-metadata`** to read the file's real duration, then converts seconds → **frames**:
```js
const fastDuration = rawDuration / 1.2;                 // audio is sped up 20%
const durationInFrames = Math.ceil(fastDuration * 30) + 15;  // 30 fps + 15-frame tail pad
```
This `durationInFrames` is how the video later knows exactly how long each scene should last.

### d) Resilience layer — `services/retry.js`
Your own helper (not a library). Free APIs frequently return **429** (rate limit) or **503** (busy):
- `withRetry(fn)` retries **transient** errors with **exponential backoff** (1.5s → 3s → 6s). Permanent errors (e.g. bad API key) are thrown immediately.
- `isTransient(err)` inspects status codes and message text to decide what's worth retrying.
- `cleanErrorMessage(err)` turns ugly upstream errors into friendly sentences ("The AI model is busy right now…"). This is what makes a free-tier app *feel* reliable.

---

## 4. Video Rendering with Remotion

The standout technology: **Remotion lets you build videos with React.** You write JSX components, and Remotion renders them into real MP4 frames.

### The mental model
A video is just **frames** played at a frame rate (**30 fps** here). Remotion renders your React component **once per frame**; you read the current frame number and decide what's on screen. **Animation = "what should this look like at frame N?"**

### `frontend/src/RemotionRoot.jsx` — registration
Defines `<Composition id="MasterVideo">`. The key piece is **`calculateMetadata`**: it sums every scene's `durationInFrames` to compute total length and sets width/height from the chosen aspect ratio (1080×1920 vertical or 1920×1080 horizontal).

### `frontend/src/components/MasterVideo.jsx` — the video itself
It first lays scenes onto a global timeline (each scene's `start`/`end` frame), then stacks three layers:
1. **Images with effects:**
   - **Ken Burns** — `interpolate(local, [0, dur], [1, 1.15])` slowly zooms each still so it feels alive.
   - **Crossfade** — each image mounts a few frames *early* and dissolves in via `opacity`, so there's no black flash at cuts.
2. **Audio** — `<Audio src=... playbackRate={1.2}>` inside a `<Sequence>` placed at the scene's start frame (hard cut, never overlapping).
3. **Captions** — the `<DynamicCaptions>` component.

**Core Remotion APIs you used:** `useCurrentFrame()`, `useVideoConfig()` (fps/size), `interpolate()` (map a frame range to a value range), `spring()` (physics-based bounce), `<Sequence>` (place something at a time offset), `<AbsoluteFill>` (a full-screen layer), `<Img>`, `<Audio>`.

### `frontend/src/components/DynamicCaptions.jsx` — animated subtitles
Two styles:
- **Word-by-word** — divides the scene's time by word count; each word "pops in" on its beat with a `spring()` scale, the current word highlighted gold.
- **Full-sentence** — the whole line springs in at once.

Nice details: loads **two Google fonts** (Montserrat for Latin, Noto Sans Devanagari for Hindi) so Hindi captions render correctly, and `cleanWords()` preserves the Devanagari Unicode block instead of stripping it.

### `backend/services/renderService.js` — making the MP4 on the server
Runs Remotion **headlessly** (no visible browser):
1. **`bundle()`** — webpacks the React video code into a servable bundle (cached so it's only built once per process).
2. **`selectComposition()`** — selects `MasterVideo` and passes the scenes as `inputProps`.
3. **`renderMedia({ codec: 'h264', ... })`** — renders every frame (via a headless Chrome) and encodes to an **H.264 MP4**, reporting `onProgress` back to the job.

**Data flow:** backend pipeline → Remotion `inputProps` → React renders frames → H.264 encode → `.mp4` on disk → served via a `/jobs/...` URL the browser can download.

> The same `MasterVideo` component powers both the **live in-browser preview** (`@remotion/player`) and the **final server render** — write once, use in both places. That's Remotion's superpower.

---

## 5. Frontend Technologies

- **React 19** — the UI library (components + state). `components/VideoStudio.jsx` is the main screen: the topic form, the option toggles (aspect ratio, narrator vs. character, caption style, language), the live progress, and the preview/download.
- **Vite** — the dev server + build tool. Extremely fast, hot-reloads on save (`npm run dev`).
- **Tailwind CSS v4** (`@tailwindcss/vite`) — utility-class styling; the dark dashboard UI is built with `className` utilities instead of separate CSS files.
- **@remotion/player** — embeds a **live preview** of the video in the browser *before* the final MP4 is rendered, using the same components as the server render.

---

## 6. End-to-End Flow

One full run, tech by tech:

1. You type a topic in the **React/Vite** UI, choose options, and hit **Generate**.
2. Frontend `POST /api/video/generate` → **Express** creates a **job**, returns a `jobId` instantly (HTTP 202), and starts `runPreparation` in the background.
3. Frontend opens an **SSE** connection to watch progress.
4. **Gemini** writes the structured script → **FLUX** (Cloudflare/Pollinations) renders a character portrait → job pauses at `awaiting_approval`.
5. You see the character and click **Approve** (or **Regenerate** for a new seed) → `runProduction` begins.
6. For each scene: **FLUX** makes the image, **Edge TTS** makes the voiceover MP3, **music-metadata** measures its duration → frames.
7. **Remotion** bundles the React video, renders all frames with Ken Burns + crossfades + animated captions, and encodes an **H.264 MP4**.
8. Job becomes `done`; SSE pushes a `downloadUrl`; **Express** serves the MP4 from `/jobs/...`; you download it.

Throughout, **`retry.js`** silently absorbs free-tier hiccups.

---

## 7. Key Patterns You Should Recognize

These are reusable, senior-level patterns you've already implemented — worth being able to name in an interview:

- **Async job + progress stream** — return an ID instantly, do slow work in the background, stream progress via SSE. (Used by every "long task" app: video, ML, exports.)
- **LLM structured output** — force JSON with a schema instead of parsing free text.
- **Provider fallback chain** — abstract multiple interchangeable backends behind one interface and fail over between them.
- **Retry with exponential backoff** — distinguish transient vs. permanent failures; retry only the transient ones.
- **Single source of truth** — `services/dimensions.js` centralizes aspect-ratio → pixel mappings so they're never duplicated.
- **Code reuse across contexts** — one Remotion component serves both live preview and final render.
- **Separation of concerns** — `routes` (URLs) → `controllers` (request handling) → `services` (business logic) → `jobs` (orchestration). Each layer has one responsibility.

---

## 8. Suggested Learning Order

1. **Node.js + Express basics** — routes, middleware, `req`/`res`. Foundation for everything backend.
2. **The async job + SSE pattern** — *why* long tasks can't be one request. Re-read `jobStore.js` + `videoController.js`.
3. **REST APIs + calling external services** with `axios`/SDKs, plus retry/backoff.
4. **LLM structured output** (JSON schema with Gemini) — a key modern AI-engineering skill.
5. **Remotion** — highest-leverage thing here. Read [remotion.dev](https://www.remotion.dev). Master `useCurrentFrame` + `interpolate` + `spring`.
6. **React + Tailwind** for the UI layer.

---

## 9. Glossary

| Term | Meaning |
|------|---------|
| **API** | A contract for one program to call another (here, over HTTP). |
| **REST** | A style of HTTP API using URLs + verbs (GET/POST) on "resources." |
| **SSE** | Server-Sent Events — one-way server→browser streaming over HTTP. |
| **Middleware** | A function Express runs on every request (e.g. JSON parsing, CORS). |
| **Job** | A background task with tracked status/progress. |
| **EventEmitter** | Node's publish/subscribe object; powers the progress stream. |
| **LLM** | Large Language Model (Gemini here) — generates the script. |
| **Schema / structured output** | Forcing the LLM to return strict, predictable JSON. |
| **System instruction** | Hidden "rules" given to the LLM to steer its behavior. |
| **FLUX** | The open-source text-to-image model that draws the scenes. |
| **Seed** | A number that makes image generation reproducible/consistent. |
| **TTS** | Text-to-Speech — turns narration text into spoken audio. |
| **fps** | Frames per second (30 here). |
| **Frame** | One still picture in the video; Remotion renders one React render per frame. |
| **Composition** | A Remotion video definition (component + size + duration + fps). |
| **Interpolate** | Map a frame range to a value range (the basis of animation). |
| **Spring** | Physics-based animation with natural bounce. |
| **Ken Burns** | The slow zoom/pan applied to still images. |
| **H.264** | The standard video codec the MP4 is encoded with. |
| **Exponential backoff** | Retrying with ever-longer waits (1.5s, 3s, 6s…). |

---

*This guide reflects the `develop` branch. As you add Phase 8 (lip-sync) and Phase 9 (deployment), extend the relevant sections so this stays your single source of truth.*

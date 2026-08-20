# Norwegian Pronunciation Coach 🗣️
A lightweight web app that lets you **record yourself, get instant feedback on Norwegian pronunciation, and level‑up sentence by sentence**.

---

## Why I Built This 🎯

When I was learning Norwegian I found pronunciation especially challenging.
None of the language‑learning apps I tried gave me **phrase‑level, real‑time feedback** on my speaking, so I decided to build my own tool—first for myself, and eventually for international friends who were going through the same struggle.

## ✨ Key Features

| Area | Highlights |
|------|------------|
| **Frontend (React + Vite + TypeScript + Tailwind)** | • Countdown 3‑2‑1 → record → stop<br>• Confetti on success, "Try again" overlay on failure<br>• Word‑by‑word zoom while recording<br>• Click any flagged word to see its phoneme breakdown<br>• Responsive layout, works on phones and desktops<br>• Progress (level, streak, history) persisted locally |
| **Backend (FastAPI)** | • Accepts audio (`/upload-audio/`)<br>• Converts any format to WAV (16 kHz mono, +300 ms silence) with **pydub + ffmpeg**<br>• Local **Whisper** model for ASR (size configurable via `WHISPER_MODEL_SIZE`, defaults to `small`; CPU-only PyTorch)<br>• Word-level alignment (catches every mismatch, not just the first) + **phoneme-level IPA similarity scoring** rolled into a composite `pronunciation_score` |
| **Gamified Levels** | • 50 levels • 10 sentences per level • Needs *1* success to advance (configurable) |
| **Dockerised Backend** | Single `python:3.10-slim` image with ffmpeg, PyTorch CPU and all Python deps pinned |

---

## 🗂️ Project Structure
```
norwegian-pronunciation-app/
│
├── backend/
│   ├── Dockerfile          # see below
│   ├── main.py             # FastAPI + Whisper endpoint
│   ├── scoring.py          # word alignment + phoneme similarity (pure, unit-testable)
│   └── requirements.txt
│
├── src/
│   ├── components/         # AudioRecorder + focused sub-components
│   ├── hooks/               # useAudioRecorder, usePronunciationSession
│   ├── utils/               # ipaTokenizer, pronunciationHints
│   ├── data/sentences.json # sentences by level
│   ├── App.tsx
│   └── main.tsx
│
└── README.md (this file)
```

---

## 🚀 Getting Started

### 1 · Backend (API)

Docker:
```bash
cd backend
docker build -t pronun-backend .
docker run --rm -p 8000:8000 pronun-backend
# FastAPI live at http://localhost:8000/docs
```

Local (no Docker) — requires ffmpeg + espeak-ng installed on your machine:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2 · Frontend

```bash
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:8000
npm run dev
# open http://localhost:5173
```

---

## ⚙️ Environment Notes

Backend (env vars, all optional):

| Variable | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `small` | Whisper model to load (`tiny`/`base`/`small`/`medium`/`large`) |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allow-list |
| `MAX_UPLOAD_BYTES` | `15728640` (15 MB) | Rejects larger audio uploads with 413 |

Frontend:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` (dev) / `""` (Docker build) | Backend base URL used for all API calls. The Docker image builds the frontend with it empty, since that image serves both frontend and API from the same origin — pass `--build-arg VITE_API_URL=https://your-api.example.com` at build time if they're split across domains. |

Other notes:
* **CPU-only** PyTorch wheel is installed from `download.pytorch.org` → works on any machine; no CUDA needed.
* Whisper model weights are cached inside the Docker volume on first run.
* eSpeak-NG in `phonemizer` currently handles Norwegian (`nb`, `nn`, `no`) for IPA output.

---

## ❓ How Feedback Works

1. **Recording** → browser `MediaRecorder` → `.webm`.
2. Backend pads 0.3 s silence, down‑samples to 16 kHz mono.
3. **Whisper** transcribes with `language="no"`, beam‑size 5, prompt = expected sentence.
4. The expected and heard sentences are **word-aligned** (`backend/scoring.py`, a small Needleman‑Wunsch alignment) so every inserted/deleted/substituted word is caught correctly — not just the first mismatch.
5. Each non-matching word gets a **phoneme similarity score**: both words are converted to IPA and compared with normalized edit distance, instead of a flat right/wrong.
6. All per-word scores roll up into one composite `pronunciation_score` (0–100) for the sentence, alongside the classic WER for reference.
7. UI highlights every flagged word and shows a phoneme-level breakdown + plain‑language hint (`src/utils/pronunciationHints.ts`) on click.

---

## 🔮 Planned / In Progress

* Finer‑grained phoneme alignment (Montreal Forced Aligner / wav2vec2 phoneme recognizer).
* Multiple dialect audio samples.
* PWA offline mode.
* Expanded `pronunciationHints.ts` (consonant clusters, tone accents).
* CI pipeline & production deploy.

---

> **Project status:** the app works end‑to‑end but is **still under active development** – expect breaking changes and lots of 🔧 experiments!

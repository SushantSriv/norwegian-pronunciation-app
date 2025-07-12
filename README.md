# Norwegian Pronunciation Coach 🗣️🇳🇴
A lightweight web app that lets you **record yourself, get instant feedback on Norwegian pronunciation, and level‑up sentence by sentence**.

---


## Why I Built This 🎯

When I was learning Norwegian I found pronunciation especially challenging.  
None of the language‑learning apps I tried gave me **phrase‑level, real‑time feedback** on my speaking, so I decided to build my own tool—first for myself, and eventually for international friends who were going through the same struggle.


## ✨ Key Features

| Area | Highlights |
|------|------------|
| **Frontend (React + Vite + TypeScript)** | • Countdown 3‑2‑1 → record → stop<br>• Confetti on success, “Try again” overlay on failure<br>• Word‑by‑word zoom while recording<br>• Click any word to hear the correct pronunciation<br>• **Phoneme hints:** if Whisper mis‑recognises a word, the app shows a plain‑language tip (e.g. “Use a long *u* like in *sol*”) |
| **Backend (FastAPI)** | • Accepts audio (`/upload-audio/`)<br>• Converts any format to WAV (16 kHz mono, +300 ms silence) with **pydub + ffmpeg**<br>• Local **Whisper‑medium** model for ASR (`openai‑whisper`, CPU‑only PyTorch)<br>• Calculates WER + substitutions/deletions/insertions with **jiwer**<br>• Generates IPA for the expected and heard word via **phonemizer (eSpeak‑NG)** and returns a “bad word” section for the UI |
| **Gamified Levels** | • 50 levels • 10 sentences per level • Needs *1* success to advance (configurable) |
| **Dockerised Backend** | Single `python:3.10-slim` image with ffmpeg, PyTorch CPU and all Python deps pinned |

---

## 🗂️ Project Structure
\`\`\`
norwegian-pronunciation-app/
│
├── backend/
│   ├── Dockerfile          # see below
│   ├── main.py             # FastAPI + Whisper + IPA hints
│   ├── requirements.txt
│   └── uploads/            # temp audio (git-ignored)
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── AudioRecorder.tsx   # core UI + logic
│   │   ├── utils/
│   │   │   └── phonemeHints.ts     # IPA → human tip map
│   │   ├── data/
│   │   │   └── sentences.json      # sentences by level
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.css
│
└── README.md (this file)
\`\`\`

---

## 🚀 Getting Started

### 1 · Backend (API)

\`\`\`bash
# clone & cd backend
docker build -t pronun-backend .
docker run --rm -p 8000:8000 pronun-backend
# FastAPI live at http://localhost:8000/docs
\`\`\`

### 2 · Frontend

\`\`\`bash
# clone & cd frontend
npm install
npm run dev
# open http://localhost:5173
\`\`\`

The frontend POSTs recordings to \`http://localhost:8000/upload-audio/\`.

---

## ⚙️ Environment Notes

* **CPU-only** PyTorch wheel is installed from \`download.pytorch.org\`  
  → works on any machine; no CUDA needed.
* Whisper model weights are cached inside the Docker volume on first run.
* eSpeak-NG in \`phonemizer\` currently handles Norwegian (\`nb\`, \`nn\`, \`no\`) for IPA output.

---

## ❓ How Feedback Works

1. **Recording** → browser \`MediaRecorder\` → \`.webm\`.
2. Backend pads 0.3 s silence, down‑samples to 16 kHz mono.
3. **Whisper** transcribes with \`language="no"\`, beam‑size 5, prompt = expected sentence.
4. If first mismatch is found:  
   * Convert *expected* word and *heard* word to IPA.  
   * Send back \`bad_word\`, \`expected_ipa\`, \`heard_ipa\`, \`word_index\`.
5. UI highlights the word in red **and shows a plain‑language hint** using \`src/utils/phonemeHints.ts\`.

---

## 🔮 Planned / In Progress

* Finer‑grained phoneme alignment (Montreal Forced Aligner).
* Multiple dialect audio samples.
* PWA offline mode & user progress storage.
* Expanded \`phonemeHints.ts\` (consonant clusters, tone accents).
* CI pipeline & production deploy.

---

> **Project status:** the app works end‑to‑end but is **still under active development** – expect breaking changes and lots of 🔧 experiments!

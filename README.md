# Norwegian Pronunciation Coach 🗣️

Practise Norwegian out loud, get **instant phoneme-level feedback**, and clear
levels one phrase at a time — entirely in your browser.

> **Live:** https://sushantsriv.github.io/norwegian-pronunciation-app/
> Requires **Chrome or Edge** (see [Browser support](#-browser-support)).

---

## Why I Built This 🎯

When I was learning Norwegian I found pronunciation especially challenging. None of
the apps I tried gave me **phrase-level feedback on my speaking**, so I built my own
— first for myself, then for friends going through the same struggle.

## 🎮 How it works

1. **Pick a stage** — five levels from *First Words* (A1) to *Advanced* (B2), drawn
   from a 500-phrase corpus.
2. **Say the phrase.** The browser transcribes what you said.
3. **Get scored 0–100.** Not just right/wrong: each word is compared *by sound*, so
   a near-miss scores better than a completely different word.
4. **Clear 10 phrases before you lose 3 lives.** The pass bar **rises by 3 points
   every time you clear one**, so it gets harder as you go.
5. **Missed a word?** You get its IPA breakdown — the sounds you should have made
   versus the ones you did — plus a plain-language tip.

## 🧠 How the scoring actually works

| Step | What happens |
|---|---|
| **Transcribe** | Web Speech API (`nb-NO`) turns your speech into text |
| **Align** | Needleman-Wunsch word alignment (`src/utils/scoring.ts`) — re-syncs after a dropped or extra word instead of cascading every later word out of position |
| **Phonemise** | Each word → IPA via a rule-based Norwegian G2P (`src/utils/norwegianG2P.ts`) |
| **Compare** | Normalised edit distance between expected and heard IPA → a per-word similarity in [0, 1] |
| **Composite** | Per-word scores averaged, minus a small penalty per spurious extra word → the 0–100 score |

The G2P covers vowel length, diphthongs, the `kj`/`sj`/`skj` series, retroflex
`rt`/`rd`/`rn`/`rl`/`rs`, silent letters, schwa-reduced endings, and a table of
high-frequency irregulars (`jeg`, `og`, `det`, `hvordan`, …).

**It is an approximation** — no pitch accent (tonelag), no compound-word stress, and
it will be wrong on loanwords. It is a teaching aid for *"which sounds did you
miss"*, not a reference transcription.

## 🌐 Browser support

The app uses the **Web Speech API**, which today means:

| Browser | Works? |
|---|---|
| Chrome (desktop & Android) | ✅ |
| Edge | ✅ |
| Safari | ⚠️ Unreliable |
| Firefox | ❌ Not implemented |

Unsupported browsers get an explanatory screen rather than a broken mic button.
Recognition is cloud-backed, so it **needs an internet connection**.

---

## 🚀 Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run test     # vitest — 29 tests (scoring, G2P, session rules)
npm run lint     # eslint
npm run build    # tsc -b && vite build
```

## 📦 Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which lints, tests,
builds and publishes to GitHub Pages. Enable it once under
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

If you fork this under a different repo name, update `base` in `vite.config.ts` to
match — GitHub Pages serves projects from `/<repo-name>/`.

---

## 🗂️ Project structure

```
├── src/
│   ├── components/          # StageSelect, PracticeScreen, ResultsScreen,
│   │                        # ScoreRing, PhonemeBreakdown, Parallax
│   ├── hooks/
│   │   ├── usePracticeSession.ts   # stages, rising bar, lives, persistence
│   │   └── useSpeechRecognition.ts # Web Speech API wrapper
│   ├── utils/
│   │   ├── scoring.ts              # alignment + composite scoring
│   │   ├── norwegianG2P.ts         # grapheme → IPA
│   │   └── pronunciationHints.ts   # IPA → plain-language explanation
│   ├── data/
│   │   ├── sentences.json          # 50 levels × 10 phrases
│   │   └── stages.ts               # the 5 pickable stages
│   └── App.tsx
└── backend/                 # OPTIONAL — see below
```

## 🐍 The optional Whisper backend

`backend/` holds a FastAPI + **Whisper** service that does the same scoring
server-side with far better transcription accuracy. It is **not** used by the
deployed Pages app (Pages cannot run Python) and is kept for local/self-hosted use.

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # http://localhost:8000/docs
pytest                                  # scoring tests, no model download needed
```

Env vars: `WHISPER_MODEL_SIZE` (default `small`), `ALLOWED_ORIGINS`
(default `http://localhost:5173`), `MAX_UPLOAD_BYTES` (default 15 MB).

`backend/scoring.py` and `src/utils/scoring.ts` implement the same algorithm and are
covered by parallel test suites — keep them in sync if you change one.

---

## 🔮 Ideas

* Offline recognition via `transformers.js` Whisper, to drop the Chrome-only limit.
* Recorded native audio instead of TTS for the "Hear it" button.
* A drill mode that replays only the words you have missed before.

---

📋 See [PROGRESS.md](PROGRESS.md) for the build log and known limitations.

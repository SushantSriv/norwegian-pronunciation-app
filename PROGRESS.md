# Progress & Goals

## v2 — a focused, self-contained GitHub Pages app ✅ shipped

Pivot from "wide feature surface + Python backend" to a **tight, static, free-hosted
practice app**. Decisions made with the user:

- **Hosting:** GitHub Pages. Pages is static-only, so the app must not need the
  Python/Whisper backend at runtime.
- **Speech engine:** browser **Web Speech API** (`nb-NO`). Zero download, instant,
  free. Trade-off accepted: **Chrome/Edge only** (no Firefox; Safari unreliable),
  and it needs internet.
- **Structure:** pick a **stage**, then drill words/sentences drawn from that stage.
- **Session rules:** the pass bar **rises as you clear items**; a limited **error
  budget** ends the run and shows results.
- **Visuals:** better UI + animations; **the moose mascot is removed**.

Status legend: ⬜ Not started · 🟨 In progress · ✅ Done

### Phase A — Client-side scoring engine (no backend)
- ✅ Ported word alignment + phoneme similarity to TS (`src/utils/scoring.ts`)
- ✅ Rule-based Norwegian G2P (`src/utils/norwegianG2P.ts`) replacing eSpeak/phonemizer
- ✅ Extended `pronunciationHints.ts` with schwa, ɔ, diphthongs and retroflex ɳ/ɭ
- ✅ Tests for alignment, similarity and G2P, plus a corpus-wide invariant that
  **every** phoneme the G2P emits across all 500 items has a learner-facing hint

### Phase B — Session model
- ✅ 5 CEFR-style stages (`src/data/stages.ts`) mapped onto the 50-level corpus
- ✅ Rising pass threshold (+3 per clear) and a 3-life error budget
- ✅ Per-stage best-run persistence in localStorage

### Phase C — Speech input
- ✅ `useSpeechRecognition` wrapping the Web Speech API, with friendly error text
- ✅ Explicit unsupported-browser screen for Firefox/Safari

### Phase D — UI rebuild + animations
- ✅ Stage select, practice and results screens with framer-motion transitions
- ✅ Animated score ring, rising pass bar, lives, per-word chips, phoneme breakdown
- ✅ Removed the moose mascot, AppStatus context and the name-entry gate

### Phase E — Ship it
- ✅ Vite `base` for Pages + GitHub Actions workflow (lint → test → build → deploy)
- ✅ README rewritten for the two engines (static default, backend optional)
- ✅ Dropped now-unused deps (`react-tsparticles`, `tsparticles-engine`) and assets

### Verified
`tsc -b`, `eslint`, `vitest` (29 tests), `vite build`, plus a scripted real-browser
pass (Edge via Playwright, Web Speech API stubbed) covering: stage select → practice
→ correct answer clears and raises the bar → wrong answer shows the phoneme
breakdown → lives exhausted → results, at desktop and mobile widths, with **no
console or page errors**.

Bugs caught during that browser pass and fixed:
1. Opaque `body` background painted over the `z-index:-10` parallax, so the
   background art was invisible.
2. The progress bar rendered **full** at 0/10 — a `motion.div` animating `width`
   with no `initial`.
3. Feedback showed the word-by-word breakdown of the *previous* phrase, because
   the session advances the item as soon as an attempt is graded.
4. Glass cards were too translucent for reliable white-text contrast over the
   bright sky; switched to a dark tint.

### Known limitations
- The G2P is an approximation: no pitch accent (tonelag), no compound stress, and
  it will be wrong on loanwords. Good enough as a "which sounds did you miss" aid.
- Web Speech API means Chrome/Edge + an internet connection.

---

## Ideas / not done
- Offline engine via `transformers.js` Whisper, to drop the Chrome-only constraint
- Recorded native audio instead of TTS for the "Hear it" button
- Drill mode that replays only your previously missed words

---

## v1 foundations

<details>
<summary>Backend hardening, phoneme scoring, Tailwind rebuild (commits <code>00fb053..ae80b73</code>)</summary>

- Repo hygiene: untracked `.vs/`, removed stray `backend/3.0` and duplicate `requirements.txt`
- Security: removed a process-wide TLS-verification bypass; CORS via `ALLOWED_ORIGINS`
- Deployability: `VITE_API_URL`, guarded static mount, `WHISPER_MODEL_SIZE`, upload size cap
- Scoring: replaced the `zip()` word comparison (only ever caught the first mismatch) with
  real Needleman-Wunsch alignment + per-word IPA edit-distance → composite `pronunciation_score`
- Frontend: Tailwind, responsive layout, split the ~980-line `AudioRecorder.tsx`, a11y pass

The FastAPI backend still lives in `backend/` as the higher-accuracy option; it is
simply not what the Pages deployment runs.
</details>

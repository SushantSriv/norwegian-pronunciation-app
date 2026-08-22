# Progress & Goals

## v2.2 — Ring alignment, silence trimming, wider voice support ✅ shipped

### Fixed
- ✅ **Visualiser ring was off-centre.** Bars were laid out with `top: 0` and
  `transform-origin: 50% 100%`, putting the rotation pivot a full bar-length *below*
  the ring centre, so every bar orbited the wrong point. Anchoring the bar's bottom
  edge on the centre (`top: -barLength`) makes the origin the true centre. Verified by
  measuring every bar's distance from the mic centre in a real browser: 56 bars,
  radius spread **0.00px**.
- ✅ Ring now fades back when idle instead of sitting there as a ragged dashed circle.

### Added
- ✅ **Playback skips dead air.** Holding the button before speaking meant listen-back
  started with silence. A relative-threshold RMS scan finds where speech actually
  starts and stops (with 60ms padding so the first consonant is not clipped), and
  playback seeks to that point and stops at the end. Shown as a "✂ trimmed" badge.
  Covered by 5 tests over synthetic silence/tone/silence clips.
- ✅ **Scandinavian neighbour voices** as a fallback when no Norwegian voice exists.
  Swedish and Danish are far closer to Norwegian than the English voice a machine
  otherwise defaults to — clearly labelled, with a note that they are not a substitute.
- ✅ The picker now explains where voices come from and flags Edge's neural voices (✨),
  which sound considerably more natural than older local SAPI ones.

### Changed
- Recording is decoded **once** via `analyseRecording()` and shared by the melody chart
  and the trimmed player through `useRecordingAnalysis`, instead of decoding twice.

---

## v2.1 — Listen-back, melody analysis, design pass ✅ shipped

Response to feedback: the reference voice sounded wrong, there was no way to compare
your attempt against it, and the UI wanted more polish.

### Fixed
- ✅ **The TTS voice bug.** `speechSynthesis.getVoices()` returns an empty array on the
  first synchronous call in Chrome/Edge, so voice selection silently failed and
  Norwegian was being read aloud by an English voice — exactly why it did not sound
  Norwegian. Selection now goes through an awaited `loadVoices()`.
  (Verified empirically: this machine exposes exactly one Norwegian voice,
  `nb-NO / Microsoft Jon`; every other installed voice is en-US.)
- ✅ Mic idle animation no longer animates `transform` — framer-motion owns that
  property on the same element and the two were fighting. Glow only now.
- ✅ Feedback exit no longer mixes `variants` with an `exit` object, which had wedged
  `AnimatePresence mode="wait"` so the mic never returned after pressing Next.

### Added
- ✅ **Listen-back comparison.** The Web Speech API never hands back its audio, so a
  MediaRecorder runs on a parallel mic stream. Correct vs You, with a slow toggle.
- ✅ **Melody view — the distinctive feature.** Norwegian is a pitch-accent language and
  flat delivery is the classic non-native giveaway. The recording is run through
  autocorrelation F0 detection and drawn as a pitch contour with a semitone-range
  readout and coaching. Mainstream apps do not do this.
- ✅ Voice picker ranked best-first (neural "Natural" voices outrank older local SAPI),
  choice persisted.
- ✅ Per-word playback inside the phoneme breakdown.
- ✅ Streak counter, success burst, aurora wash, glass surfaces, shimmering progress
  bar, staggered reveals, word-by-word phrase animation, live mic visualiser.

### Notes on the dialect request
**Nynorsk is a written standard, not a spoken dialect** — nobody "speaks Nynorsk", they
speak a dialect (Østnorsk, Vestlandsk, Trøndersk...). Browsers expose voices, not
dialects, and `nn-NO` voices are essentially nonexistent. The picker therefore lists
the Norwegian voices actually installed, labelled by locale tag, instead of offering
dialects the platform cannot deliver.

### Known limitations
- Pitch detection is honest about uncertainty: unvoiced/quiet frames return `null`
  rather than a guess, though a dominant 2nd harmonic can still cause an octave slip
  (median-filtered, and covered by tests).
- Playback quality is capped by whatever voices the OS and browser provide.

---

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
`tsc -b`, `eslint`, `vitest` (42 tests), `vite build`, plus a scripted real-browser
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

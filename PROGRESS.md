# Progress & Goals

## v2.5 — Compound decomposition, DTW melody scoring, on-device recognition ✅

### Added
- ✅ **Compound decomposition for words the lexicon does not carry.** Norwegian
  compounds freely and writes the result as one word, so no lexicon keeps up:
  "skiftetøy" is absent from NB Uttale, "skifte" and "tøy" are not.
  `decomposeCompound` in `norwegianG2P.ts` splits an unknown word into members we
  do know — recursive, memoised, with `-s-`/`-e-` links — and the lexicon layer
  stitches their transcriptions back together with the compound's own stress.
  75 corpus words that no lexicon could enumerate now get a real transcription
  and a real pitch accent.
- ✅ **A compound accent rule measured rather than assumed.** The textbook line
  is "compounds take accent 2"; against the 351 marked compounds in the east
  chunk it is wrong often. What holds: a polysyllabic first member lends the
  compound its own accent ("data" is accent 1, so every data- compound is), and
  a monosyllabic first member gives accent 1 with an `-s-` link (tidsbruk,
  tidspunkt, driftskostnader — 5 of 5) and accent 2 without one (sollys,
  matvarer, språkkompetanse — 21 of 21). Predicting the recorded tone of
  lexicon compounds from their members alone: **85%** (106/125). Two guards
  stop the splitter over-generating: a member must contain a vowel (NB Uttale
  lists spelled-out abbreviations, so `dashboards` came apart as
  `dash + boa + rds`), and a three-way split is only taken when no two-way one
  exists and every member is at least four letters (`grunnpillarer` otherwise
  reads as `grunn + pilla + rer`, where every fragment is a real word).
- ✅ **DTW melody scoring.** The melody chart was decorative; it now scores.
  Pitch is normalised to semitones against the speaker's own median in
  `pitch.ts` (so a bass and a soprano compare), and `dtw.ts` aligns the learner's
  contour to the target by shape rather than by clock, which is what makes a
  correctly shaped but unhurried delivery score as correct. 0 means "no closer
  than a flat delivery", which is the failure mode worth naming.
- ✅ **The target contour is drawn on the learner's own timeline**, warped by the
  same alignment, instead of stretched evenly across the clip.

### Changed
- ✅ **Recognition runs on this device.** The Web Speech API is gone, replaced by
  a quantized whisper-tiny on ONNX Runtime Web in a worker. This is the fix for
  three separate long-standing constraints at once: Firefox and most of iOS are
  no longer locked out, nothing works only online any more, and no audio leaves
  the browser.
- ✅ **Listen-back and the melody chart work on mobile.** They were disabled
  there because a `MediaRecorder` fought the recogniser for the microphone.
  There is one recorder now and recognition reads its output afterwards, so the
  whole "recording is blocked on this device" mechanism — and its localStorage
  flag — is deleted.
- ✅ **Whisper hallucinations are not scored.** Given silence the model returns
  whatever its language model finds likely, usually a caption artefact from its
  training data. Clips are checked for actual speech with `findSpeechBounds`
  before transcription, and known artefacts are rejected after it.
- ✅ **Pronunciation coverage went from 68% to 95.6%.** The build script only
  ever read `sentences.json`, so **414 occupation words — the entire workplace
  vocabulary, skiftetøy and hentetid among them — shipped with no lexicon entry
  at all.** The data was there; nothing asked for it. The script now reads both
  corpora and the chunks were regenerated against the real 158 MB source:
  1,625 of 1,779 words come straight from NB Uttale, 75 more from compound
  decomposition, and the 79 still on the rule engines are almost entirely
  English tech vocabulary — *agile*, *governance*, *dashboards* — that NB Uttale
  does not have because they are not Norwegian words.
- ✅ **`parts.<dialect>.json`**, a second output holding the sub-words the
  corpus's unresolved compounds need. 3 KB gzipped, loaded alongside the dialect
  chunk, and it is what lets `skiftetøy` resolve to real data for both members.
- ✅ Diagnostics no longer judge the browser. They used to tell a Firefox user to
  install Chrome, which was correct advice about the Web Speech API and is now
  simply wrong.

### Costs, stated plainly
- First use downloads ~40 MB of model plus 5.7 MB (gzipped) of ONNX Runtime,
  cached afterwards. Neither is precached, so first **page** load is unchanged
  at 1.9 MB. The dialect chunk grew from 62 KB to 80 KB (20 KB gzipped) now that
  it carries the occupation vocabulary it always should have.
- A second or two of WASM inference per attempt, more on an older phone.
- whisper-tiny is a small model and will mis-hear a learner sometimes; that
  shows up as a low score the learner did not earn.
- No interim results — the model sees a finished clip, not a stream.

### Not verified
The model path was proven end to end under Node (loads in 4.3 s, transcribes,
honours `language: 'no'`). It has **not** been run in a real browser: WASM
inference speed on mobile Safari in particular is an estimate.

---

## v2.4 — Mobile fixes ✅ shipped

Reported from Android Chrome: "microphone is blocked by browser", and no voice audible.

### Fixed
- ✅ **Microphone blocked on mobile — a regression from v2.1.** The parallel
  `MediaRecorder` added for listen-back grabbed the mic via `getUserMedia`, then
  `SpeechRecognition` tried to grab it too. Android Chrome routes recognition through
  the system speech service, which wants the microphone to itself, so recognition
  failed with a permission error. Recognition is the essential feature, so the
  recorder is now skipped on mobile, and disabled automatically anywhere it turns out
  to conflict (mic error while recording → drop recording, invite a retry).
  Verified under an Android user agent: **0 `getUserMedia` calls**.
- ✅ **No speech audible on mobile.** `speakNorwegian()` awaited a voice lookup and a
  60ms timer before calling `speak()`, which breaks the user-gesture chain — mobile
  browsers only allow synthesis to start inside the task that triggered it, so
  playback was silently blocked. `speak()` is now called **synchronously**, reading
  voices from the already-warmed cache. The Chrome "dropped utterance after cancel()"
  workaround became a re-queue 250ms later, which no longer needs the gesture.
  Verified: `navigator.userActivation.isActive` is **true** at `speak()` time.

### Changed
- Listen-back and the melody chart now say *why* they are unavailable on a device that
  reserves the mic, instead of showing a dead button and a misleading
  "not enough voiced sound" message.
- "No Norwegian voice" guidance is platform-aware (Android / iOS / macOS / Windows) —
  `Microsoft Jon` is a Windows voice and does not exist on a phone.

### Known constraint for sharing
Still Chrome/Edge only; Firefox and most iOS browsers get the unsupported screen.
On mobile the trade-off is explicit: scoring works everywhere the mic does, but
listen-back and melody analysis are desktop-only.

---

## v2.3 — Better speech: live voice list, karaoke tracking, speed control ✅ shipped

### Fixed
- ✅ **The good voices could never appear.** `loadVoices()` cached its snapshot
  permanently and listened for `voiceschanged` with `{ once: true }`. Edge registers
  local SAPI voices first and its far better *online neural* voices a moment later, so
  the neural voices were resolved past and never seen. The list is now a live
  subscription that keeps listening, and voice selection re-reads it on every call.
- ✅ **A rejected voice silenced playback entirely.** Assigning `utterance.voice` throws
  if the engine rejects the object, which aborted `speak()` before it started. Now
  caught, falling back to the `lang` hint so something is still spoken.

### Added
- ✅ **Karaoke word tracking.** The phrase highlights word by word as the reference
  voice says it, using `SpeechSynthesisUtterance.onboundary` character offsets mapped
  back to word indices. Ties the sound to the spelling, and the button becomes Stop
  while speaking.
- ✅ **Speaking-speed control** (Slow / Relaxed / Normal / Brisk), persisted, and applied
  consistently across "Hear it", the Correct button and per-word playback. The slow
  toggle now scales *from* the chosen speed rather than overriding it.
- ✅ Voices warm up on mount, so the first "Hear it" is not what triggers the async
  voice fetch.

### Verified
Ranking confirmed in a real browser with two Norwegian voices present: the neural
"Pernille ✨" sorts above the older local "Jon". Karaoke tracking confirmed by driving
boundary events and observing the highlight advance.

---

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

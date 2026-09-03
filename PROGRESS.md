# Progress & Goals

## v2.6 — Word-by-word melody, recognition trust, and a learning record ✅

### Fixed — and only findable in a browser
- 🔴 **Recognition did not work in any browser at all.** whisper-base's q8 build
  loads and transcribes perfectly under Node, and fails outright on ONNX Runtime
  Web — `Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale`
  — in Chromium and WebKit alike. Nothing in this repository could have caught
  it: the unit tests stub the worker, and the accuracy benchmark runs under Node
  precisely so it can measure word error rate without a browser. It took running
  the real worker in a real engine, which is what `bench/` now exists for.
  The worker now walks q8 → int8 → uint8 → fp32 and keeps the first that loads,
  because the same class of failure can hit an engine that cannot be tested from
  here and a single pinned precision turns that into an app that silently does
  nothing.

### Added
- ✅ **Melody, word by word.** Whisper's per-word timestamps
  (`return_timestamps: 'word'`, about 0.3 s on a 2 s decode) make it possible to
  say WHICH word's melody went wrong rather than only that one did. Each word is
  judged on its own slice of the same contour, against the accent the lexicon
  gives that word. Existing parts do the work: `alignWords` matches heard to
  expected, `scoreMelody` and `classifyAccent` judge the slice.
- ✅ **Feedback that is an instruction, not a mark.** Six diagnoses, each a
  measurement of the two contours: flat, wrong accent, moving the opposite way,
  peaking or dipping too early or too late, and the right shape too small.
  Checked in that order — there is no point discussing peak timing with someone
  who did not move their pitch. The score stays, in small print.
- ✅ **Recognition uncertainty.** whisper-base is measured at 48% word error rate
  on read Norwegian, so it mis-hears people; presenting that as a pronunciation
  mistake teaches the learner to distrust every piece of feedback the app gives.
  An attempt is now judged before it is scored, and one we cannot vouch for
  costs no life and is offered again. The signals are strictly evidence from the
  AUDIO — speech detected but nothing returned, or recognised words spanning
  under 40% of the measured speech. It deliberately does not guess from the
  transcript: whether a wrong transcript means the model failed or the learner
  said something else is not decidable from text, and a heuristic that tried
  would excuse real mistakes.
- ✅ **A learning record**, in localStorage and nowhere else. Which sounds keep
  coming out wrong (compared symbol by symbol, so one bad vowel does not blame
  the consonants around it), which accent is not landing, which words are
  slipping. Leitner scheduling at 0/1/3/7/16/35 days orders each run by
  never-seen, then most overdue, then worst recent score.
- ✅ **"Practice my weaknesses"**, a stage with no corpus of its own: the pool is
  assembled from whichever phrases exercise the sound or accent the learner is
  currently worst at, using their own IPA rather than hardcoded categories. It
  stays hidden until there is enough evidence to name a weakness.

### Privacy
Unchanged and now load-bearing. The learning record is a JSON blob in this
browser: no account, no sync, no server, no analytics. Recordings are never
stored, only the scores derived from them, and clearing site data is a complete
erase. There is nowhere for it to go, because nothing here can send it anywhere.

### Verified
tsc, eslint, vitest (229 tests, 45 new) and a production build on every commit.
Word timestamps confirmed against Xenova/whisper-base on real Norwegian audio.
Browser measurements below.

### Not verified
- **Chrome on Android and Safari on iOS.** Playwright reaches Chromium, Firefox
  and WebKit on this machine; the branded mobile browsers need real devices.
  `bench/bench.html` is a plain page, so opening it through `npm run dev` on a
  phone produces the same table — that is the way to close this gap.
- The melody and profile panels have not been driven by hand in a browser; their
  logic is pure and unit-tested, their rendering is not.

### Left for next time
- **NbAiLab/nb-whisper-\*** remains the biggest accuracy win available and still
  cannot be used as published: a split encoder/decoder ONNX export with no merged
  decoder and no quantized weights.
- Native reference recordings. Melody targets are one canonical curve per accent
  because there is no corpus of native speakers to build an envelope from; that,
  not a cleverer curve, is what would make pitch scoring more robust.
- Scenario-based occupation tracks — short realistic exchanges rather than
  vocabulary lists.

---

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
- ✅ **The chart names the tonelag the learner actually produced.** Scoring an
  attempt out of 100 against one target is a grade, and a grade is the least
  useful thing to hand someone learning a distinction they cannot yet hear.
  `classifyAccent` asks which of the two shapes the delivery fits — a relative
  decision, which survives microphone noise where an absolute threshold on
  stylised curves does not — and says "that came out as Tonelag 1, but this word
  takes Tonelag 2". It refuses to guess: a flat delivery is equidistant from
  both, so below half a semitone of margin it says nothing.
- ✅ **Tone twins are surfaced.** 106 words in this corpus are two different
  words that only the accent separates — `huset` the house against `huset`
  housed, `avtale` the noun against the verb. The practice screen now says so
  and names both parts of speech. The data was already in the entry.

### Changed
- ✅ **The speech model was chosen by measuring it.** `scripts/bench-asr.mjs`
  runs candidates over read Norwegian from google/fleurs and reports word error
  rate. whisper-tiny — which I had shipped on the reasoning that it was the
  smallest checkpoint that knew any Norwegian — scored **79%**, which is not
  usable: every mis-hearing is a failed attempt that was actually correct, and
  the learner cannot tell their mistake from the model's. whisper-base scores
  **48%** for less than double the download and a difference in speed too small
  to feel, and now ships. Quantization turned out not to be free either: it
  costs `tiny` 14 points, so the answer was a bigger model rather than heavier
  weights. The benchmark is committed rather than described, so the next
  checkpoint can be judged in one command.
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
- ✅ **Two ways the learner was charged for the transcript's spelling.** Whisper
  transcribes rather than dictates, so "fem" comes back as "5" while the corpus
  spells it out, and alignment counted a substitution — then scored it zero,
  because every character of "5" is stripped before the G2P sees it. And
  Norwegian compounds come back written apart as often as together, so
  "skiftetøy" heard as "skifte tøy" cost a substitution plus an insertion for a
  phrase said correctly — which matters here more than most places, since the
  compounds ARE the exercise in the occupation tracks. Both are reconciled
  before alignment, and only ever towards words the phrase actually asked for.
- ✅ Diagnostics no longer judge the browser. They used to tell a Firefox user to
  install Chrome, which was correct advice about the Web Speech API and is now
  simply wrong.

### Costs, stated plainly
- First use downloads ~40 MB of model plus 5.7 MB (gzipped) of ONNX Runtime,
  cached afterwards. Neither is precached, so first **page** load is unchanged
  at 1.9 MB. The dialect chunk grew from 62 KB to 80 KB (20 KB gzipped) now that
  it carries the occupation vocabulary it always should have.
- A second or two of WASM inference per attempt, more on an older phone.
- whisper-base is a small model and will mis-hear a learner sometimes; that
  shows up as a low score the learner did not earn. 48% word error rate on
  long-form read prose; short everyday phrases fare much better, but not
  perfectly.
- No interim results — the model sees a finished clip, not a stream.

### Not verified
The model path was proven end to end under Node — it loads, transcribes, honours
`language: 'no'`, and its word error rate was measured. It has **not** been run
in a real browser: WASM inference speed, on mobile Safari in particular, is an
estimate rather than a measurement.

### Left for next time
- **NbAiLab/nb-whisper-\*** would almost certainly beat any multilingual
  checkpoint on Norwegian, and cannot be used as published: a split
  encoder/decoder ONNX export with no merged decoder, which transformers.js
  cannot load, and no quantized weights, which would make it a 216 MB download
  if it could. Re-exporting it is the single biggest accuracy win available.
- Melody is only scored for single words; a phrase has one accent per word and
  nothing aligns the audio to the words yet.

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

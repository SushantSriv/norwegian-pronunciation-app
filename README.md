<div align="center">

<img src="public/icon-192.png" width="96" alt="" />

# Norsk uttale

**Say Norwegian out loud. See your intonation, phoneme by phoneme.**

[**▶ Open the app**](https://sushantsriv.github.io/norwegian-pronunciation-app/) · Free · No sign-up · Runs entirely in your browser

</div>

---

Most pronunciation apps tell you *whether* you were right. This one shows you **why**,
including the thing that most often gives a non-native speaker away in Norwegian:
**melody**.

Norwegian is a *pitch-accent* language. Speaking it with flat, English-style intonation
is instantly recognisable — and virtually no learning app measures it. This one records
your attempt, extracts the pitch contour, and draws it.

## What it does

| | |
|---|---|
| 🎙️ **On-device recognition** | A quantized Whisper model runs inside the page itself. Every word is aligned and scored, so a dropped or inserted word does not throw off everything after it. |
| 🔤 **Phoneme feedback** | Each missed word is broken into IPA sounds, with a plain-language explanation of the target sound and what you actually said. |
| 📈 **Melody scoring** | Your pitch contour, normalised to semitones and aligned to the *expected* shape for that word's tonelag by dynamic time warping — so a correctly shaped but unhurried delivery scores as correct. Flat delivery scores zero, by construction. |
| 🗣️ **Dialects** | Østnorsk, Vest-/sørvestnorsk or Trøndersk/nordnorsk. The transcription under every phrase updates live, so the choice is visible rather than buried in error feedback. |
| 🎧 **Listen back** | Play the reference and your own attempt back to back. Silence before and after you speak is trimmed automatically. |
| 🎯 **Rising difficulty** | Clear 10 phrases before losing 3 lives. The pass bar climbs with every one you get right. |
| 📚 **13 tracks** | Five CEFR levels from A1 words to B2 clusters, plus eight occupation tracks — helse, bygg, barnehage, butikk, restaurant, transport, renhold, kontor. |

Your voice never leaves your browser: not the recording, not the transcript, not the
score. Recognition runs as a local model rather than a cloud service, so that is a
property of the architecture rather than a promise.

## Requirements

- **Any current browser with a microphone** — Firefox, Chrome, Edge and Safari, desktop or mobile. Speech recognition is a quantized Whisper model running in the page on WebAssembly, not a browser API, so there is no longer a browser that gets locked out.
- **About 82 MB on first use**, downloaded once and then cached: a quantized whisper-base (76 MB) plus the ONNX Runtime it runs on (5.7 MB gzipped). After that recognition works with the network off. The rest of the app is ~1.9 MB.
- **A Norwegian text-to-speech voice** for the reference audio. Most systems have one; the app tells you how to add one if not.
- A second or two of thinking time per attempt while the model transcribes, more on an older phone. That is the cost of not sending your voice anywhere.

## Install it

It is a PWA, so you can add it to your home screen or desktop and use it offline:
open the app and choose **Install** from the address bar or menu. Recognition works offline
once the model has been fetched once.

## Running it yourself

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 167 unit tests
npm run build      # production build
```

There is no backend to run and no API key to hold. Everything — speech recognition, word
alignment, Norwegian grapheme-to-phoneme conversion, compound splitting, pitch detection
and melody alignment — happens client-side in TypeScript.

<details>
<summary><strong>Optional: the original FastAPI backend</strong></summary>

`backend/` still holds the original Whisper-based scoring service, running a full-size
model server-side. The browser now runs Whisper too, just a much smaller checkpoint, so
what the backend still buys you is accuracy rather than capability. It is not what the
hosted app uses.

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

| Variable | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `small` | Whisper model to load |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allow-list |
| `MAX_UPLOAD_BYTES` | 15 MB | Upload size cap |

</details>

<details>
<summary><strong>Optional: analytics</strong></summary>

The app ships with **no tracking**. Set `VITE_ANALYTICS_URL` at build time to enable a
cookie-less page counter (GoatCounter, Plausible, etc.). Do Not Track is respected and no
identifiers are stored. Recordings are never sent to any analytics endpoint.

Speech **recognition** used to be the exception to this: it was performed by the browser's
own service, which meant the audio went to Google's, Microsoft's or Apple's servers. It now
runs as a local model on ONNX Runtime Web, so the recording, the transcript, the scoring and
the pitch analysis never leave the device.

</details>

## How the scoring works

1. A quantized **whisper-base** transcribes the recording, in a web worker, on your own
   device. The clip is checked for actual speech first: given silence Whisper does not
   return nothing, it returns whatever its language model finds likely.
2. Expected and heard words are **aligned** with Needleman–Wunsch, so inserted or
   dropped words do not cascade into false errors.
3. Each mismatched word is converted to IPA — from the NB Uttale lexicon where it is
   covered, by splitting it into known compound members where it is not, and by a
   rule-based G2P otherwise — then compared by normalised edit distance, so a near-miss
   scores higher than a completely wrong word.
4. Per-word scores roll into one 0–100 composite, which the rising pass bar tests.
5. Your recording is separately run through autocorrelation **pitch detection**,
   normalised to semitones against your own median pitch, and aligned to the target
   contour by **dynamic time warping** before being scored.

Two normalisations are what make the melody score mean anything. Semitones
(`ST = 12·log₂(F₀ / F₀ median)`) remove the speaker: a bass at 100 Hz and a soprano at
200 Hz saying the same word share a shape and no frequencies at all. DTW removes the
clock: a learner is usually slower than the reference, and comparing frame-for-frame
would mark a correctly shaped delivery wrong. What is left is the shape of the melody,
which is what pitch accent actually is. The score is expressed against a flat baseline,
so 0 means "no closer to the target than not trying" — the exact failure mode the chart
exists to catch.

**Known limits:** whisper-base is a small model and will mis-hear a learner sometimes,
which shows up as a low score they did not earn. `scripts/bench-asr.mjs` measures exactly
that against read Norwegian from google/fleurs, and the model was picked on those numbers
rather than on size — `tiny` scored 79% word error rate against `base`'s 48%, which in a
pronunciation app means failing attempts that were correct. The fallback G2P used outside the
lexicon is an approximation and will be wrong on loanwords. Pitch detection returns
nothing rather than guessing on unvoiced or quiet frames. The melody target is drawn for
single words only, since a phrase has one accent per word.

## Yrkesnorsk

Alongside the five CEFR stages there are eight occupation tracks — the sectors
where Norwegian learners most often actually work:

| | |
|---|---|
| 🏥 Helse og omsorg | pain, medication, next of kin, discharge |
| 🏗️ Bygg og anlegg | scaffolding, protective gear, drawings, safety |
| 🧸 Barnehage og skole | parents, outdoor clothes, pick-up times |
| 🛒 Butikk og service | receipts, returns, opening hours |
| 🍽️ Restaurant og kjøkken | orders, allergies, closing time |
| 🚚 Transport og logistikk | loads, routes, paperwork |
| 🧼 Renhold | products, equipment, finishing a shift |
| 💻 Kontor og IT | access, deadlines, screen sharing |

Occupation vocabulary gets the same IPA, tonelag and phoneme feedback as the general
corpus. Words like `skiftetøy`, `hentetid` and `tørkepapir` are ordinary Norwegian
compounds that no lexicon can enumerate, because Norwegian forms compounds freely and
writes the result as one word. They are now **split into members the lexicon does
know** — `skifte + tøy`, `hente + tid` — and reassembled with the compound's own stress
and pitch accent, instead of falling back to the rule engine whose weakest point was
exactly that.

## Pronunciation data

Pronunciation and pitch-accent data comes from **[NB Uttale](https://www.nb.no/sprakbanken/en/resource-catalogue/oai-nb-no-sbr-79/)**,
the Norwegian Language Bank's pronunciation lexicon, published by
Nasjonalbiblioteket under **[CC0](https://creativecommons.org/publicdomain/zero/1.0/)**
(public domain). Credit is given because it is deserved, not because CC0 requires it.

It supplies, per word and per dialect area:

- broad IPA with stress and syllable structure
- **tonelag** — pitch accent 1 vs 2, which is what `bønder` (farmers) and
  `bønner` (beans) differ by, and nothing else
- part of speech, which separates senses such as `avtale` the noun (accent 2)
  from `avtale` the verb (accent 1)

`scripts/build-pronunciation.mjs` filters the 785,000-word source down to the
1,779 words this app actually uses, across both corpora. Each dialect group is a
lazy-loaded chunk, so picking one costs a single ~20 KB gzipped fetch. The script
also emits `parts.<dialect>.json` (3 KB gzipped) — the sub-words needed to
decompose whatever compounds remain unresolved — which the app loads alongside it.

NB Uttale distinguishes five areas, but across this corpus two pairs transcribe
**identically** — west matches southwest, and north matches Trøndelag — so they
are offered as three groups rather than five choices that would change nothing
when selected. The build script detects and skips those duplicates. East differs
from west/southwest on 176 of 1,625 words, and from Trøndelag/north on just 16.

### Coverage

| Source | Words | Share |
|---|---|---|
| NB Uttale, directly | 1,625 | 91.3% |
| Compound decomposition into NB Uttale members | 75 | 4.2% |
| Rule engines | 79 | 4.4% |

**95.6% of the corpus is backed by real pronunciation data.** It used to be 68%,
and the gap was not NB Uttale's: the build script only ever read `sentences.json`,
never `occupations.json`, so all 414 occupation-only words shipped with no lexicon
entry at all — the data existed, nothing asked for it.

The 79 words still on the rule engines are almost entirely English technical
vocabulary that appears in the Kontor og IT track — *agile*, *governance*,
*benchmarking*, *dashboards*, *tokens*. NB Uttale does not have them because they
are not Norwegian words, so that is the honest floor rather than a gap to close.
Those rules are demonstrably weaker than real data — the accent heuristic gets
`mistet` and `morgen` wrong — which is exactly why the lexicon is preferred
wherever it reaches.

### Compound pitch accent

The rule for compounds was derived from the data rather than taken from a textbook.
"Compounds take accent 2" is the usual line, and against the 351 marked compounds in
the east chunk it is wrong often enough to matter:

| First member | Accent | Evidence |
|---|---|---|
| Polysyllabic | its own | `data` is accent 1, so `datasett`, `datalagring` and `dataanalyse` all are |
| Monosyllabic + `-s-` | 1 | `tidsbruk`, `tidspunkt`, `tidsskrift`, `driftskostnader`, `kravspesifikasjoner` — 5 of 5 |
| Monosyllabic, no link | 2 | `sollys`, `matvarer`, `halvtime`, `grunnlag`, `språkkompetanse` — 21 of 21 |

Predicting the recorded tone of lexicon compounds from their members alone gets
**85%** (106/125). Prefixed words — `tilpasning`, `oppdatering`, `forberedelse` — are
deliberately kept off this path: they look like compounds and behave nothing like
them, since `oppgave` is accent 2 and `oppdatering` accent 1, so the accent is lexical
and there is nothing structural to derive.

Two further guards stop the splitter over-generating, which is the failure mode of
every compound splitter. A member must contain a vowel, because NB Uttale lists
spelled-out abbreviations and without it `dashboards` came apart as
`dash + boa + rds`. And a three-way split is only taken when no two-way one exists
and every member is at least four letters: `grunnpillarer` otherwise reads as
`grunn + pilla + rer`, where every fragment is a real Norwegian word, while genuine
three-part compounds like `smart + hjem + enheter` are built from substantial ones.

## Feedback

Found a bug or a phrase that scores wrongly?
[Open an issue](https://github.com/SushantSriv/norwegian-pronunciation-app/issues/new).

## Licence

**All rights reserved.** This is source-available, not open source — see
[LICENSE](LICENSE). You may read the code; you may not use, copy, modify or
redistribute it without written permission. Contact me if you would like to.

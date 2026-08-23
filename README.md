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
| 🎙️ **Live scoring** | Say the phrase; every word is aligned and scored, so a dropped or inserted word does not throw off everything after it. |
| 🔤 **Phoneme feedback** | Each missed word is broken into IPA sounds, with a plain-language explanation of the target sound and what you actually said. |
| 📈 **Melody view** | Your pitch contour, measured from your own recording, with a semitone-range readout. Flat delivery gets flagged. |
| 🎧 **Listen back** | Play the reference and your own attempt back to back. Silence before and after you speak is trimmed automatically. |
| 🎯 **Rising difficulty** | Clear 10 phrases before losing 3 lives. The pass bar climbs with every one you get right. |
| 📚 **5 levels** | A1 single words through B2 consonant clusters, drawn from a 500-phrase corpus. |

Your voice is analysed **in your browser**. No audio and no transcript is ever uploaded.

## Requirements

- **Chrome or Edge.** Speech recognition uses the Web Speech API, which Firefox and iOS browsers do not implement. Other browsers get a clear message rather than a broken page.
- **A Norwegian text-to-speech voice** for the reference audio. Most systems have one; the app tells you how to add one if not.
- On phones, scoring works, but **listen-back and the melody chart are desktop-only** — mobile browsers reserve the microphone for speech recognition.

## Install it

It is a PWA, so you can add it to your home screen or desktop and use it offline:
in Chrome/Edge, open the app and choose **Install** from the address bar or menu.

## Running it yourself

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 66 unit tests
npm run build      # production build
```

There is no backend to run. Everything — word alignment, Norwegian grapheme-to-phoneme
conversion, pitch detection — happens client-side in TypeScript.

<details>
<summary><strong>Optional: the original FastAPI backend</strong></summary>

`backend/` still holds the original Whisper-based scoring service, which is more
accurate than browser speech recognition. It is not what the hosted app uses.

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
cookie-less page counter (GoatCounter, Plausible, etc.). Do Not Track is respected, no
identifiers are stored, and audio never leaves the browser regardless.

</details>

## How the scoring works

1. The browser transcribes your speech (`nb-NO`).
2. Expected and heard words are **aligned** with Needleman–Wunsch, so inserted or
   dropped words do not cascade into false errors.
3. Each mismatched word is converted to IPA by a rule-based Norwegian G2P and compared
   by normalised edit distance — a near-miss scores higher than a completely wrong word.
4. Per-word scores roll into one 0–100 composite, which the rising pass bar tests.
5. Your recording is separately run through autocorrelation pitch detection for the
   melody chart.

**Known limits:** the G2P is an approximation — no tone accent, no compound stress, and
it will be wrong on loanwords. Pitch detection returns nothing rather than guessing on
unvoiced or quiet frames.

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
~1,350 words this app actually uses, giving ~60 KB per dialect. Each dialect is
a separate lazy-loaded chunk, so picking one costs a single small fetch.

Coverage is about 89%. Words the lexicon does not carry — mostly proper nouns —
fall back to the rule-based engines in `src/utils/norwegianG2P.ts` and
`src/data/tonelag.ts`. Those rules are demonstrably weaker: on a sample of five
words the accent heuristic got `mistet` and `morgen` wrong, which is exactly why
real data is preferred wherever it exists.

## Feedback

Found a bug or a phrase that scores wrongly?
[Open an issue](https://github.com/SushantSriv/norwegian-pronunciation-app/issues/new).

## Licence

**All rights reserved.** This is source-available, not open source — see
[LICENSE](LICENSE). You may read the code; you may not use, copy, modify or
redistribute it without written permission. Contact me if you would like to.

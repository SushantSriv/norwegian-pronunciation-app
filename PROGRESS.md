# Improvement Progress

Tracking the plan to make this app production-quality: fixed foundations, an advanced phoneme-level scoring engine, and a responsive Tailwind UI.

Status legend: ⬜ Not started · 🟨 In progress · ✅ Done

## Phase 0 — Progress tracking
- ✅ Create this file

## Phase 1 — Repo hygiene & security
- ✅ Untrack `.vs/` and ignore it
- ✅ Remove stray `backend/3.0`
- ✅ Remove duplicate root `requirements.txt`
- ✅ Remove TLS-verification bypass in `backend/main.py`
- ✅ Restrict CORS via `ALLOWED_ORIGINS` env var

## Phase 2 — Deployability
- ✅ `VITE_API_URL` env var wired into frontend fetch calls (`src/hooks/useAudioRecorder.ts`, `.env.example`)
- ✅ Guard backend static mount / SPA route so `uvicorn main:app` runs standalone
- ✅ `WHISPER_MODEL_SIZE` env var (default `small`), fix README mismatch
- ✅ Upload size guard on `/upload-audio/`

## Phase 3 — Advanced pronunciation scoring (backend)
- ✅ Real word alignment (`backend/scoring.py::align_words`, Needleman-Wunsch — catches every bad word, not just the first)
- ✅ Phoneme-level similarity scoring (IPA edit-distance) per word
- ✅ Composite `pronunciation_score` (0–100) replacing raw-WER threshold gating
- ✅ New `word_scores[]` response shape
- ✅ Difficulty thresholds flipped to intuitive "score >= X" (`usePronunciationSession.ts`)

## Phase 4 — UI rebuild (Tailwind, responsive, componentized)
- ✅ Tailwind installed & configured (`tailwind.config.js`, `postcss.config.js`, `src/index.css`)
- ✅ `useAudioRecorder` hook extracted
- ✅ `usePronunciationSession` hook extracted + localStorage persistence
- ✅ `NameGate`, `SessionSummary`, `SentenceCard`, `ScorePanel`, `RecordControls` components
- ✅ `AudioRecorder.tsx` reduced to thin composition (~270 lines, was ~980)
- ✅ Responsive layout (mobile header/mascot/card/grid reflow, touch targets ≥44px)
- ✅ Accessibility pass (`aria-live`/`role="status"` on overlays, non-color bad-word marker (⚠️ icon + underline, not color alone))
- 🧹 Removed dead files found along the way: `src/App.css`, `src/SnowTest.tsx`, duplicate `src/context/useAppStatus.tsx`

## Phase 5 — Light test coverage (stretch)
- ✅ Backend pytest for scoring/alignment function (`backend/tests/test_scoring.py`) — zero heavy deps, runs standalone
- ✅ Frontend Vitest for the session hook (persistence, level advance, threshold logic, summary) — `src/hooks/__tests__/usePronunciationSession.test.ts`

---

## What was actually verified this session

Node turned out to be installed (just not on the default PATH), so the frontend was verified for real rather than by review alone:
- `npx tsc -b` — clean, no type errors
- `npx eslint .` — clean
- `npx vitest run` — 7/7 passing
- `npm run build` — production build succeeds (Tailwind CSS compiles to ~17 kB)
- Launched the real dev server and drove it with Playwright against local Edge: screenshotted the name-gate and in-session screens at desktop (1280px) and mobile (390px) widths, filled the name form, and confirmed no console/page errors.

Two real bugs were caught this way and fixed:
1. `usePronunciationSession`'s `restart()` called `localStorage.removeItem` right before a state update that the persistence effect immediately re-wrote — dead code, fixed by removing the pointless call and asserting the real (reset-to-default) end state in the test instead.
2. After the refactor, confirming your name never moved the mascot status out of `'welcome'`, so the corner mascot silently never appeared during a session. Fixed by having the name-gate submit and session-restart handlers explicitly set status to `'idle'`/`'welcome'`.
3. (Visual only, no test could catch it) the mascot's `z-index: 100` painted over the header's dropdowns at desktop widths — fixed by lowering it below the header/card's stacking context so it peeks out from behind them instead.

Python is not installed in this environment (only an unusable Windows Store stub), so **the backend (`scoring.py`, `main.py`) could not be executed here** — it was carefully self-reviewed and hand-traced instead, plus a pytest suite was written for the pure scoring logic. Run it yourself with the commands below.

## How to verify the backend locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # http://localhost:8000/docs

# fast, no Whisper/torch needed for the scoring tests specifically:
pip install pytest
pytest
```

Then with both servers running (`npm run dev` + the uvicorn command above), manually run through: name entry → record → composite score + multi-word highlighting → next sentence → finish → resize the window to confirm mobile layout.

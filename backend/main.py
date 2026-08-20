# -*- coding: utf-8 -*-
import io
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import numpy as np
import whisper
from jiwer import Compose, RemovePunctuation, Strip, ToLowerCase, wer
from phonemizer import phonemize
from pydub import AudioSegment

from scoring import align_words, phoneme_similarity

# ───── Config (env-driven so the same image works in dev & prod) ───────────
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 15 * 1024 * 1024))  # 15 MB
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend-build")

# ───── Load Whisper model ─────────────────────────────────────────────────
model = whisper.load_model(WHISPER_MODEL_SIZE)

# ───── FastAPI + CORS ─────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve built frontend (Vite build output), if present — lets the API run
# standalone in dev without a prior `npm run build`.
_assets_dir = os.path.join(FRONTEND_DIST, "assets")
if os.path.isdir(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

# ───── Helpers ─────────────────────────────────────────────────────────────
_normalize = Compose([Strip(), RemovePunctuation(), ToLowerCase()])


def to_ipa(word: str) -> str:
    return phonemize(
        word,
        language="nb",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
    )


def _strip_punct(word: str) -> str:
    return word.strip(".,!?;:").lower()


# ───── Endpoint ────────────────────────────────────────────────────────────
@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str = Form(...),
):
    # 1️⃣ Read upload into memory (size-guarded)
    webm_bytes = await audio.read()
    if len(webm_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large")
    webm_io = io.BytesIO(webm_bytes)

    # 2️⃣ Decode and pad via pydub, resample to 16 kHz mono
    raw = AudioSegment.from_file(webm_io, format="webm")
    padded = (
        AudioSegment.silent(300) + raw + AudioSegment.silent(300)
    ).set_frame_rate(16_000).set_channels(1)

    # 3️⃣ Convert to float32 NumPy array in [–1,1]
    samples = np.array(padded.get_array_of_samples(), dtype=np.float32)
    samples /= np.iinfo(padded.array_type).max  # pydub gives int16, so normalize

    # 4️⃣ Transcribe from NumPy array
    result = model.transcribe(
        samples,
        language="no",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        prompt=expected,
    )
    transcript = result["text"].strip()

    # 5️⃣ Compute sentence-level WER (kept for reference/telemetry)
    error_rate = wer(_normalize(expected), _normalize(transcript))

    # 6️⃣ Word-level alignment (catches EVERY mismatch, not just the first)
    #     + per-word phoneme-similarity scoring, rolled into one composite score.
    truth_words = expected.split()
    hyp_words = transcript.split()
    chunks = align_words(
        [_strip_punct(w) for w in truth_words],
        [_strip_punct(w) for w in hyp_words],
    )

    word_scores = []
    weighted_total = 0.0
    insertions = 0

    for kind, ref_idx, hyp_idx in chunks:
        if kind == "insert":
            insertions += 1
            continue

        ref_word = truth_words[ref_idx]
        if kind == "equal":
            word_scores.append(
                {
                    "word": ref_word,
                    "index": ref_idx,
                    "status": "equal",
                    "score": 1.0,
                    "expected_ipa": None,
                    "heard_ipa": None,
                }
            )
            weighted_total += 1.0
            continue

        # substitute or delete
        heard_word = hyp_words[hyp_idx] if hyp_idx is not None else ""
        expected_ipa = to_ipa(ref_word)
        heard_ipa = to_ipa(heard_word) if heard_word else ""
        score = phoneme_similarity(expected_ipa, heard_ipa) if heard_word else 0.0
        word_scores.append(
            {
                "word": ref_word,
                "index": ref_idx,
                "status": kind,  # "substitute" | "delete"
                "score": round(score, 3),
                "expected_ipa": expected_ipa,
                "heard_ipa": heard_ipa,
            }
        )
        weighted_total += score

    ref_count = max(len(truth_words), 1)
    pronunciation_score = (weighted_total / ref_count) * 100 - insertions * 3
    pronunciation_score = round(max(0.0, min(100.0, pronunciation_score)), 1)
    substitutions = sum(1 for c in chunks if c[0] == "substitute")
    deletions = sum(1 for c in chunks if c[0] == "delete")

    # 7️⃣ Return JSON
    return {
        "expected": expected,
        "transcript": transcript,
        "wer": error_rate,
        "pronunciation_score": pronunciation_score,
        "substitutions": substitutions,
        "deletions": deletions,
        "insertions": insertions,
        "word_scores": word_scores,
        "detail": "Transcription + phoneme-level pronunciation scoring",
    }


@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"status": "ok", "detail": "Norwegian Pronunciation Coach API — see /docs"}

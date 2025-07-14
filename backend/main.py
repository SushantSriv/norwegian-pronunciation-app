# -*- coding: utf-8 -*-
import ssl, io
import uuid
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
from pydub import AudioSegment
import numpy as np
from jiwer import wer, process_words, Strip, RemovePunctuation, ToLowerCase, Compose
from phonemizer import phonemize

# ───── Disable SSL checks behind proxy ─────────────────────────────────────
ssl._create_default_https_context = ssl._create_unverified_context

# ───── Load Whisper model ─────────────────────────────────────────────────
model = whisper.load_model("medium")

# ───── FastAPI + CORS ─────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ───── Endpoint ────────────────────────────────────────────────────────────
@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str     = Form(...)
):
    # 1️⃣ Read upload into memory
    webm_bytes = await audio.read()
    webm_io = io.BytesIO(webm_bytes)

    # 2️⃣ Decode and pad via pydub, resample to 16 kHz mono
    raw = AudioSegment.from_file(webm_io, format="webm")
    padded = (
        AudioSegment.silent(300)
        + raw
        + AudioSegment.silent(300)
    ).set_frame_rate(16_000).set_channels(1)

    # 3️⃣ Convert to float32 NumPy array in [–1,1]
    samples = np.array(padded.get_array_of_samples(), dtype=np.float32)
    # pydub samples are int16, so normalize:
    samples /= np.iinfo(padded.array_type).max  # typically 32767

    # 4️⃣ Transcribe from NumPy array
    result = model.transcribe(
        samples,
        language="no",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        prompt=expected
    )
    transcript = result["text"].strip()

    # 5️⃣ Compute WER & counts
    clean_truth = _normalize(expected)
    clean_hyp   = _normalize(transcript)
    error_rate  = wer(clean_truth, clean_hyp)
    metrics     = process_words(clean_truth, clean_hyp)
    subs, dels, ins = metrics.substitutions, metrics.deletions, metrics.insertions

    # 6️⃣ Quick phoneme feedback
    truth_words = expected.split()
    hyp_words   = transcript.split()
    bad_word_info = {"bad_word": None}
    for idx, (t_word, h_word) in enumerate(zip(truth_words, hyp_words)):
        if t_word.lower() != h_word.lower():
            bad_word_info = {
                "bad_word":      t_word,
                "expected_ipa":  to_ipa(t_word),
                "heard_ipa":     to_ipa(h_word),
                "word_index":    idx,
            }
            break

    # 7️⃣ Return JSON
    return {
        "expected":      expected,
        "transcript":    transcript,
        "wer":           error_rate,
        "substitutions": subs,
        "deletions":     dels,
        "insertions":    ins,
        **bad_word_info,
        "detail":        "Transcription + WER + IPA feedback"
    }

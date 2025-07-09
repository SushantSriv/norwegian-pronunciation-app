# -*- coding: utf-8 -*-

# --- Development‐only: disable SSL cert checks so Whisper can download models behind your proxy ---
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import os
import uuid
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
from pydub import AudioSegment
from jiwer import wer, process_words  # use process_words for detailed measures :contentReference[oaicite:0]{index=0}

# Load Whisper model once
model = whisper.load_model("small")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["http://localhost:5173"]
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str       = Form(...)     # pull the expected sentence from the form
):
    # 1) Save the incoming audio file
    ext      = os.path.splitext(audio.filename)[1] or ".webm"
    audio_id = f"{uuid.uuid4()}{ext}"
    in_path  = os.path.join(UPLOAD_DIR, audio_id)
    with open(in_path, "wb") as f:
        f.write(await audio.read())

    # 2) Convert to WAV (24 kHz mono) for Whisper
    wav_path = in_path + ".wav"
    seg      = AudioSegment.from_file(in_path)
    seg      = seg.set_frame_rate(24000).set_channels(1)
    seg.export(wav_path, format="wav")

    # 3) Transcribe locally
    result     = model.transcribe(wav_path, language="no")
    transcript = result["text"].strip()

    # 4) Compute WER and detailed error counts
    error_rate = wer(expected, transcript)         # 0.0–1.0
    metrics    = process_words(expected, transcript)
    subs       = metrics.substitutions
    dels       = metrics.deletions
    ins        = metrics.insertions

    return {
        "filename":      audio_id,
        "expected":      expected,
        "transcript":    transcript,
        "wer":           error_rate,
        "substitutions": subs,
        "deletions":     dels,
        "insertions":    ins,
        "detail":        "Transkripsjon + uttalefeil-måling utført"
    }

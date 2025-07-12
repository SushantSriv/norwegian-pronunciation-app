# -*- coding: utf-8 -*-
# Development-only: slå av SSL-sjekk så Whisper kan laste modeller bak proxy
import ssl, os, uuid
ssl._create_default_https_context = ssl._create_unverified_context

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
from pydub import AudioSegment
from jiwer import wer, process_words, Strip, RemovePunctuation, ToLowerCase, Compose
from phonemizer import phonemize        # ← NYTT

# ─────────────────────────── 1) Whisper-modell ────────────────────────────
model = whisper.load_model("medium")

# ─────────────────────────── 2) FastAPI + CORS ────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─────────────────────────── 3) Hjelper: tekst-norm & IPA ─────────────────
_normalize = Compose([Strip(), RemovePunctuation(), ToLowerCase()])

def to_ipa(word: str) -> str:
    """Konverter ett norsk ord til IPA-strengen via eSpeak-NG."""
    return phonemize(
        word,
        language="nb",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
    )

# ─────────────────────────── 4) Endepunkt ────────────────────────────────
@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str     = Form(...)
):
    # 4.1  lagre råfil
    ext      = os.path.splitext(audio.filename)[1] or ".webm"
    audio_id = f"{uuid.uuid4()}{ext}"
    in_path  = os.path.join(UPLOAD_DIR, audio_id)
    with open(in_path, "wb") as f:
        f.write(await audio.read())

    # 4.2  padding + resample → 16 kHz mono
    raw    = AudioSegment.from_file(in_path)
    padded = AudioSegment.silent(duration=300) + raw + AudioSegment.silent(duration=300)
    wav_path = in_path + ".wav"
    padded.set_frame_rate(16_000).set_channels(1).export(wav_path, format="wav")

    # 4.3  Whisper-transkripsjon
    result = model.transcribe(
        wav_path,
        language="no",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        prompt=expected
    )
    transcript = result["text"].strip()

    # 4.4  WER
    clean_truth = _normalize(expected)
    clean_hyp   = _normalize(transcript)
    error_rate  = wer(clean_truth, clean_hyp)
    metrics     = process_words(clean_truth, clean_hyp)
    subs, dels, ins = metrics.substitutions, metrics.deletions, metrics.insertions

    # 4.5  «Quick-and-dirty» fonem-feedback
    truth_words = expected.split()
    hyp_words   = transcript.split()

    bad_word_info = {"bad_word": None}
    for idx, (t_word, h_word) in enumerate(zip(truth_words, hyp_words)):
        if t_word.lower() != h_word.lower():
            bad_word_info = {
                "bad_word":      t_word,
                "expected_ipa":  to_ipa(t_word),
                "heard_ipa":     to_ipa(h_word),
                "word_index":    idx,        # kan brukes til highlight i UI
            }
            break

    # 4.6  JSON-respons
    return {
        "filename":      audio_id,
        "expected":      expected,
        "transcript":    transcript,
        "wer":           error_rate,
        "substitutions": subs,
        "deletions":     dels,
        "insertions":    ins,
        **bad_word_info,                    # fletter inn IPA-felt
        "detail":        "Transkripsjon + WER + enkel IPA-feedback"
    }

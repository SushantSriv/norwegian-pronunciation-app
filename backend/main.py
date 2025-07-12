# -*- coding: utf-8 -*-
# --- Development-only: slå av SSL-sjekk slik at Whisper kan hente modeller bak proxy ---
import ssl, os, uuid
ssl._create_default_https_context = ssl._create_unverified_context

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
from pydub import AudioSegment
from jiwer import (
    wer, process_words,   # WER-verktøy
    Strip, RemovePunctuation, ToLowerCase, Compose
)

# ---------------------------------------------------------------------------
# 1) Last Whisper-modell (bruk «medium» for bedre gjenkjenning av korte ord)
# ---------------------------------------------------------------------------
model = whisper.load_model("medium")

# ---------------------------------------------------------------------------
# 2) FastAPI-app + CORS
# ---------------------------------------------------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # evt. ["http://localhost:5173"]
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 3) Felles transform som normaliserer tekst før WER-måling
#    (fungerer i alle jiwer-versjoner)
# ---------------------------------------------------------------------------
_normalize = Compose([Strip(), RemovePunctuation(), ToLowerCase()])

# ---------------------------------------------------------------------------
# 4) Endepunkt: mottar lyd + forventet setning
# ---------------------------------------------------------------------------
@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str     = Form(...)
):
    # ---- 4.1 lagre opplastet fil ------------------------------------------------
    ext       = os.path.splitext(audio.filename)[1] or ".webm"
    audio_id  = f"{uuid.uuid4()}{ext}"
    in_path   = os.path.join(UPLOAD_DIR, audio_id)
    with open(in_path, "wb") as f:
        f.write(await audio.read())

    # ---- 4.2 legg på 300 ms stillhet + resample til 16 kHz mono -----------------
    raw     = AudioSegment.from_file(in_path)
    padded  = AudioSegment.silent(duration=300) + raw + AudioSegment.silent(duration=300)
    wav_path = in_path + ".wav"
    padded.set_frame_rate(16_000).set_channels(1).export(wav_path, format="wav")

    # ---- 4.3 transkriber med tvungen norsk + prompt-bias + beam search ----------
    result = model.transcribe(
        wav_path,
        language="no",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        prompt=expected          # gir modellen en sterk pekepinn
    )
    transcript = result["text"].strip()

    # ---- 4.4 beregn WER + detaljer (manuell normalisering) ----------------------
    clean_truth = _normalize(expected)
    clean_hyp   = _normalize(transcript)

    error_rate = wer(clean_truth, clean_hyp)            # 0.0–1.0
    metrics    = process_words(clean_truth, clean_hyp)
    subs, dels, ins = metrics.substitutions, metrics.deletions, metrics.insertions

    # ---- 4.5 svar ---------------------------------------------------------------
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
# -*- coding: utf-8 -*-
# --- Development-only: slå av SSL-sjekk slik at Whisper kan hente modeller bak proxy ---
import ssl, os, uuid
ssl._create_default_https_context = ssl._create_unverified_context

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
from pydub import AudioSegment
from jiwer import (
    wer, process_words,   # WER-verktøy
    Strip, RemovePunctuation, ToLowerCase, Compose
)

# ---------------------------------------------------------------------------
# 1) Last Whisper-modell (bruk «medium» for bedre gjenkjenning av korte ord)
# ---------------------------------------------------------------------------
model = whisper.load_model("medium")

# ---------------------------------------------------------------------------
# 2) FastAPI-app + CORS
# ---------------------------------------------------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # evt. ["http://localhost:5173"]
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 3) Felles transform som normaliserer tekst før WER-måling
#    (fungerer i alle jiwer-versjoner)
# ---------------------------------------------------------------------------
_normalize = Compose([Strip(), RemovePunctuation(), ToLowerCase()])

# ---------------------------------------------------------------------------
# 4) Endepunkt: mottar lyd + forventet setning
# ---------------------------------------------------------------------------
@app.post("/upload-audio/")
async def upload_audio(
    audio: UploadFile = File(...),
    expected: str     = Form(...)
):
    # ---- 4.1 lagre opplastet fil ------------------------------------------------
    ext       = os.path.splitext(audio.filename)[1] or ".webm"
    audio_id  = f"{uuid.uuid4()}{ext}"
    in_path   = os.path.join(UPLOAD_DIR, audio_id)
    with open(in_path, "wb") as f:
        f.write(await audio.read())

    # ---- 4.2 legg på 300 ms stillhet + resample til 16 kHz mono -----------------
    raw     = AudioSegment.from_file(in_path)
    padded  = AudioSegment.silent(duration=300) + raw + AudioSegment.silent(duration=300)
    wav_path = in_path + ".wav"
    padded.set_frame_rate(16_000).set_channels(1).export(wav_path, format="wav")

    # ---- 4.3 transkriber med tvungen norsk + prompt-bias + beam search ----------
    result = model.transcribe(
        wav_path,
        language="no",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        prompt=expected          # gir modellen en sterk pekepinn
    )
    transcript = result["text"].strip()

    # ---- 4.4 beregn WER + detaljer (manuell normalisering) ----------------------
    clean_truth = _normalize(expected)
    clean_hyp   = _normalize(transcript)

    error_rate = wer(clean_truth, clean_hyp)            # 0.0–1.0
    metrics    = process_words(clean_truth, clean_hyp)
    subs, dels, ins = metrics.substitutions, metrics.deletions, metrics.insertions

    # ---- 4.5 svar ---------------------------------------------------------------
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

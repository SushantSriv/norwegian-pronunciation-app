# syntax=docker/dockerfile:1
FROM python:3.10-slim

# ───────────────────────── 1) System-pakker ─────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git ffmpeg libsndfile1 sox espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ───────────────────────── 2) Pip-miljøvariabler ────────────────────
ENV PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off \
    PIP_DEFAULT_TIMEOUT=100 \
    PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org download.pytorch.org"

# ───────────────────────── 3) Oppgrader pip-tooling ─────────────────
RUN pip install --upgrade pip setuptools wheel \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org

# ───────────────────────── 4) CPU-PyTorch ───────────────────────────
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
    --trusted-host download.pytorch.org

# ───────────────────────── 5) Python-avhengigheter ──────────────────
#    requirements.txt MÅ inneholde phonemizer + resten av stacken
COPY requirements.txt .
RUN pip install -r requirements.txt \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    --trusted-host download.pytorch.org

# ───────────────────────── 6) App-kode ──────────────────────────────
COPY . .

# ───────────────────────── 7) Start FastAPI (dev reload) ────────────
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

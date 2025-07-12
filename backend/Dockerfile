# syntax=docker/dockerfile:1
FROM python:3.10-slim

# 1) System deps including CA bundle, ffmpeg, git, etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      ffmpeg \
      libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2) Copy requirements and pin trusted hosts
COPY requirements.txt .

# Set pip env vars to skip version check and disable cache 
ENV PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off \
    PIP_DEFAULT_TIMEOUT=100 \
    PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org download.pytorch.org"

# 3) Upgrade tooling via trusted-hosts
RUN pip install --upgrade pip setuptools wheel \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org

# 4) Install CPU-only PyTorch
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
    --trusted-host download.pytorch.org

# 5) Install the rest (FastAPI, Whisper, jiwer, etc.)
RUN pip install -r requirements.txt \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host download.pytorch.org

# 6) Copy app code
COPY . .

# 7) Run your FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

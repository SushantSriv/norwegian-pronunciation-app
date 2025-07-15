# --- STEP 1: Build frontend with Vite ---
FROM node:18 AS frontend
WORKDIR /frontend
COPY ./src ./src
COPY ./public ./public
COPY package.json vite.config.ts tsconfig.* ./
RUN npm install && npm run build

# --- STEP 2: Backend base image ---
FROM python:3.10-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git ffmpeg libsndfile1 sox espeak-ng \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Copy backend code
COPY backend/ .

# Copy built frontend from previous stage
COPY --from=frontend /frontend/dist ./frontend-build

# Expose port used by uvicorn
EXPOSE 8080

# Start FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

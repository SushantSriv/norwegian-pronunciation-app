# --- STEP 1: Build frontend with Vite ---
FROM node:18 AS frontend
WORKDIR /frontend
COPY ./src ./src
COPY ./public ./public
COPY index.html vite.config.ts tsconfig.* tailwind.config.js postcss.config.js package.json ./
# Same-origin deployment (frontend served by this FastAPI app): API calls are
# relative, no absolute URL to bake in. Override at build time for other setups.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
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
EXPOSE 8000

# Start FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

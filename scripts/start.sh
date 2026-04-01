#!/bin/bash
# Pilox start script — auto-detects GPU and starts with appropriate profile
set -e

COMPOSE_FILE="docker/docker-compose.local.yml"
ENV_FILE="docker/.env"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating default .env..."
  cat > "$ENV_FILE" <<EOF
PILOX_DOMAIN=localhost
AUTH_URL=http://localhost:3000
POSTGRES_PASSWORD=$(openssl rand -hex 16)
AUTH_SECRET=$(openssl rand -base64 48)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
  echo "Generated $ENV_FILE with random secrets."
fi

# Start infra (postgres, redis, traefik)
echo "Starting infrastructure..."
cd "$(dirname "$0")/.."
(cd app && docker compose up -d)

# Detect NVIDIA GPU
GPU_PROFILE=""
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
  GPU_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
  echo "GPU detected: $GPU_NAME (${GPU_VRAM}MB VRAM)"
  echo "Enabling vLLM backend for HuggingFace models..."
  GPU_PROFILE="--profile gpu"
else
  echo "No NVIDIA GPU detected — using Ollama only (CPU inference)."
fi

# Start full stack
echo "Building and starting Pilox..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $GPU_PROFILE up -d --build

echo ""
echo "============================================"
echo "  Pilox is starting up!"
echo "  Open http://localhost:3000/setup"
echo "============================================"
if [ -n "$GPU_PROFILE" ]; then
  echo "  GPU: $GPU_NAME"
  echo "  vLLM: enabled (HuggingFace models available)"
fi
echo ""

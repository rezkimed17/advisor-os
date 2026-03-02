#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh -- Pull latest changes and rebuild the Docker Compose stack.
# Called by the GitHub Actions self-hosted runner on PR merge.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo "[deploy] Pulling latest changes..."
git -C "$PROJECT_DIR" pull origin main

echo "[deploy] Rebuilding containers..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up --build -d

echo "[deploy] Pruning dangling images..."
docker image prune -f

echo "[deploy] Deployment complete."

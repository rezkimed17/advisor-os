#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh -- Pull latest changes and rebuild the Docker Compose stack.
# Called by the GitHub Actions self-hosted runner on PR merge.
# ---------------------------------------------------------------------------

set -euo pipefail

# The canonical project directory where Docker Compose and .env reside.
# Set via the ADVISOR_OS_DIR environment variable (defined in the GitHub
# Actions workflow, never hardcoded here).
if [ -z "${ADVISOR_OS_DIR:-}" ]; then
  echo "[deploy] Error: ADVISOR_OS_DIR is not set." >&2
  exit 1
fi
PROJECT_DIR="$ADVISOR_OS_DIR"

echo "[deploy] Pulling latest changes..."
git -C "$PROJECT_DIR" pull origin main

echo "[deploy] Rebuilding containers..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up --build -d

echo "[deploy] Pruning dangling images..."
docker image prune -f

echo "[deploy] Deployment complete."

#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh -- Pull latest changes and rebuild the Docker Compose stack.
# Called by the GitHub Actions self-hosted runner on PR merge.
# ---------------------------------------------------------------------------

set -euo pipefail

# The canonical project directory where Docker Compose and .env reside.
# This must be an absolute path because the GitHub Actions runner checks out
# code into its own working directory, not the live project directory.
PROJECT_DIR="${ADVISOR_OS_DIR:-/Users/mohammedrezki/Desktop/advisor-os}"

echo "[deploy] Pulling latest changes..."
git -C "$PROJECT_DIR" pull origin main

echo "[deploy] Rebuilding containers..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up --build -d

echo "[deploy] Pruning dangling images..."
docker image prune -f

echo "[deploy] Deployment complete."

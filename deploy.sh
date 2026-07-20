#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

trap 'echo "Deployment failed at line $LINENO." >&2' ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_env() {
  local name="$1"

  if ! grep -Eq "^${name}=.+" .env; then
    echo "Missing ${name} in .env" >&2
    exit 1
  fi
}

require_command git
require_command docker

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo ".env does not exist. Copy .env.example and configure it first." >&2
  exit 1
fi

require_env TELEGRAM_BOT_TOKEN
require_env TELEGRAM_CHAT_ID

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "The repository has uncommitted tracked changes." >&2
  echo "Commit or discard them before deploying." >&2
  exit 1
fi

echo "Pulling the latest code..."
git pull --ff-only

echo "Validating Docker Compose configuration..."
docker compose config --quiet

echo "Building the new image while the current service remains online..."
docker compose build --pull monitor

if [[ "${RUN_SMOKE_TEST:-1}" == "1" ]]; then
  echo "Running the non-notifying IDX smoke test..."
  docker compose run --rm \
    -e BROWSER_PROFILE_PATH=/tmp/idx-smoke-profile \
    monitor node dist/src/smoke.js
fi

echo "Starting the new service..."
docker compose up -d --remove-orphans monitor

container_id="$(docker compose ps -q monitor)"

if [[ -z "$container_id" ]]; then
  echo "The monitor container was not created." >&2
  exit 1
fi

echo "Waiting for the service to become healthy..."

for attempt in $(seq 1 60); do
  status="$(
    docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id"
  )"

  case "$status" in
    healthy)
      echo "Deployment completed successfully."
      docker compose ps monitor
      exit 0
      ;;
    unhealthy|exited|dead)
      echo "Container entered an unhealthy state: $status" >&2
      docker compose logs --tail=100 monitor >&2
      exit 1
      ;;
  esac

  sleep 2
done

echo "Timed out waiting for the monitor to become healthy." >&2
docker compose logs --tail=100 monitor >&2
exit 1

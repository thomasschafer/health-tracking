#!/usr/bin/env bash
# Starts the health server with the private environment file, for use by launchd or by hand.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="${HEALTH_ENV_FILE:-$HOME/.config/health-tracking/env}"

if [[ ! -f "$root/dist/client/index.html" ]]; then
  echo "No client build found. Run npm run build in $root first." >&2
  exit 1
fi

cd "$root"
exec node --env-file-if-exists="$env_file" src/server/main.ts

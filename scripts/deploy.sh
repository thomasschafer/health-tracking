#!/usr/bin/env bash
# Rebuilds the app from the current checkout and restarts the background server, so changes
# go live. Run after pulling or committing changes on the machine that serves the app.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

use_service_path
echo "Building with Node $(node --version)"

cd "$root"
npm ci --no-audit --no-fund
npm run build

if launchctl print "gui/$(id -u)/$SERVER_LABEL" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$SERVER_LABEL"
    echo "Restarted $SERVER_LABEL."
else
    echo "The background server isn't installed (see docs/operations.md); start it with scripts/start-server.sh." >&2
fi

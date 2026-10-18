#!/usr/bin/env bash
# Rebuilds the app from the current checkout and restarts the background server, so changes
# go live. Run after pulling or committing changes on the machine that serves the app.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
label="org.nix-community.home.health-tracking-server"

plist="$HOME/Library/LaunchAgents/$label.plist"
if [ -f "$plist" ]; then
    # Build with the same Node as the service: native modules only load under the Node
    # version they were built for.
    PATH="$(plutil -extract EnvironmentVariables.PATH raw "$plist"):$PATH"
    export PATH
fi
echo "Building with Node $(node --version)"

cd "$root"
npm ci --no-audit --no-fund
npm run build

if launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$label"
    echo "Restarted $label."
else
    echo "The background server isn't installed (see docs/operations.md); start it with scripts/start-server.sh." >&2
fi

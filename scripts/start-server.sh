#!/usr/bin/env bash
# Starts the health server with the private settings and credentials, for use by launchd or by
# hand.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

if [[ ! -f "$root/dist/client/index.html" ]]; then
  echo "No client build found. Run npm run build in $root first." >&2
  exit 1
fi

required_major="$(awk '$1 == "nodejs" { split($2, version, "."); print version[1] }' "$root/.tool-versions")"
if ! [[ "$required_major" =~ ^[0-9]+$ ]]; then
    echo "Couldn't read a Node major version from the nodejs line in $root/.tool-versions." >&2
    exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" != "$required_major" ]; then
    echo "Node $required_major is required (see .tool-versions), but $(command -v node) is $(node --version)." >&2
    exit 1
fi

load_env
cd "$root"
exec node src/server/main.ts

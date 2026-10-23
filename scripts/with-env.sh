#!/usr/bin/env bash
# Runs a command with the private settings and credentials in its environment, as the background
# services have them.
#
# Usage: scripts/with-env.sh <command...>
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

[ $# -gt 0 ] || die "usage: scripts/with-env.sh <command...>"
load_env
exec "$@"

#!/usr/bin/env bash
# Runs the backup checks now, with the same tools and settings as the background service, and
# records the results so the app updates too. Exits non-zero if any check fails.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

use_service_path
load_env
cd "$root"
exec node scripts/backup-check.ts

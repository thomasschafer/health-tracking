#!/usr/bin/env bash
# Runs Litestream replication with the private settings and credentials, for use by launchd or by
# hand.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

load_env

: "${HEALTH_DATA_DIR:?HEALTH_DATA_DIR must be set in $ENV_FILE}"
: "${LITESTREAM_CONFIG:?LITESTREAM_CONFIG must be set in $ENV_FILE}"
: "${LITESTREAM_ENDPOINT:?LITESTREAM_ENDPOINT must be set in $ENV_FILE}"

exec "${LITESTREAM_BIN:-litestream}" replicate -config "$LITESTREAM_CONFIG"

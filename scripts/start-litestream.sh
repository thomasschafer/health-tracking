#!/usr/bin/env bash
# Runs Litestream replication with the private environment file, for use by launchd or by hand.
set -euo pipefail

env_file="${HEALTH_ENV_FILE:-$HOME/.config/health-tracking/env}"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$env_file"
set +a

: "${LITESTREAM_CONFIG:?LITESTREAM_CONFIG must be set in $env_file}"
: "${LITESTREAM_ACCESS_KEY_ID:?LITESTREAM_ACCESS_KEY_ID must be set in $env_file}"
: "${LITESTREAM_SECRET_ACCESS_KEY:?LITESTREAM_SECRET_ACCESS_KEY must be set in $env_file}"
: "${LITESTREAM_SSE_CUSTOMER_KEY:?LITESTREAM_SSE_CUSTOMER_KEY must be set in $env_file}"

exec "${LITESTREAM_BIN:-litestream}" replicate -config "$LITESTREAM_CONFIG"

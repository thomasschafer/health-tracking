#!/usr/bin/env bash
# Sets up this machine to run the app, prompting for anything missing. Safe to re-run.
#
# The background services (see docs/operations.md) only start once the environment file
# exists, so this restores the database from R2 *before* writing that file. Otherwise the app
# could start with an empty database, and Litestream could replicate it over the backup.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
config_dir="$HOME/.config/health-tracking"
env_file="${HEALTH_ENV_FILE:-$config_dir/env}"
data_dir="$HOME/.local/share/health-tracking"
port=8787
https_port=8443

say() { printf '\nhealth-tracking: %s\n' "$*"; }
die() {
    echo "health-tracking: error: $*" >&2
    exit 1
}

if [ ! -t 0 ]; then
    [ -f "$env_file" ] || echo "Warning: health-tracking isn't set up; run $root/scripts/setup-machine.sh" >&2
    exit 0
fi

litestream_bin="$(command -v litestream || true)"
if [ -z "$litestream_bin" ]; then
    "$root/scripts/install-litestream.sh" >/dev/null
    litestream_bin="$root/.tools/bin/litestream"
fi

# Usage: require_keys <file> <key...>
require_keys() {
    local file="$1" key
    shift
    for key in "$@"; do
        grep -q "^$key=." "$file" || die "$file has no value for $key"
    done
}

# Writes a new environment file to $1, from a pasted copy or from prompts.
create_env() {
    local out="$1" answer
    echo
    echo "No settings file at $env_file."
    echo "  p) Paste a saved copy (e.g. from your password manager)"
    echo "  n) Enter the R2 details now"
    read -rp "Choose [p/n]: " answer
    case "$answer" in
        p)
            echo "Paste the file, then press Ctrl-D on an empty line:"
            cat >"$out"
            ;;
        n)
            local account key_id secret sse
            read -rp "Cloudflare account ID: " account
            read -rp "R2 access key ID: " key_id
            read -rsp "R2 secret access key (hidden): " secret
            echo
            read -rsp "Backup encryption key (hidden; leave blank to generate a new one): " sse
            echo
            if [ -z "$sse" ]; then
                [ -z "$(ls -A "$data_dir" 2>/dev/null)" ] ||
                    die "a new encryption key can't read existing backups; paste your saved key instead"
                sse="$(openssl rand -base64 32)"
                echo "Generated a new encryption key. Save it in your password manager now:"
                echo "  $sse"
            fi
            cat >"$out" <<EOF
# Private settings for the health-tracking app. Never commit or share this file.
HEALTH_DATA_DIR=$data_dir
LITESTREAM_CONFIG=$root/deploy/litestream.yml
LITESTREAM_ENDPOINT=https://$account.r2.cloudflarestorage.com
LITESTREAM_ACCESS_KEY_ID=$key_id
LITESTREAM_SECRET_ACCESS_KEY=$secret
# Without this key the backups can't be read. Keep a copy in your password manager.
LITESTREAM_SSE_CUSTOMER_KEY=$sse
EOF
            ;;
        *) die "expected p or n" ;;
    esac
}

mkdir -p -m 700 "$config_dir" "$data_dir"

if [ ! -f "$env_file" ]; then
    umask 077
    pending="$(mktemp "$config_dir/env.pending.XXXXXX")"
    trap 'rm -f "$pending"' EXIT
    create_env "$pending"
    require_keys "$pending" HEALTH_DATA_DIR LITESTREAM_CONFIG LITESTREAM_ENDPOINT \
        LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY LITESTREAM_SSE_CUSTOMER_KEY

    if [ ! -f "$data_dir/health.db" ]; then
        say "restoring the database from R2 (if there is a backup)"
        (
            set -a
            # shellcheck source=/dev/null
            source "$pending"
            set +a
            "$litestream_bin" restore -config "$LITESTREAM_CONFIG" -if-replica-exists \
                -o "$data_dir/health.db" "$data_dir/health.db"
        )
        if [ -f "$data_dir/health.db" ]; then
            echo "Restored $(sqlite3 "$data_dir/health.db" "select count(*) from bp_sessions where deleted_at is null") sessions."
        else
            echo "No backup found; starting with an empty database."
        fi
    fi

    # Writing the file last is what lets the background services start.
    mv "$pending" "$env_file"
    trap - EXIT
    say "saved settings to $env_file"
fi

require_keys "$env_file" HEALTH_DATA_DIR LITESTREAM_CONFIG LITESTREAM_ENDPOINT \
    LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY LITESTREAM_SSE_CUSTOMER_KEY

if command -v tailscale >/dev/null; then
    if ! tailscale serve status 2>/dev/null | grep -q ":$https_port "; then
        read -rp "Serve the app over Tailscale on port $https_port? [y/N] " answer
        if [ "$answer" = y ] || [ "$answer" = Y ]; then
            tailscale serve --bg --https="$https_port" "http://127.0.0.1:$port"
        fi
    fi
    url="$(tailscale serve status 2>/dev/null | grep -o "https://[^ ]*:$https_port" | head -1 || true)"
    [ -n "$url" ] && say "open $url on your phone"
else
    echo "Warning: Tailscale isn't installed, so the app is only reachable from this Mac." >&2
fi

#!/usr/bin/env bash
# Sets up this machine to run the app, prompting for anything missing. Safe to re-run.
#
# The background services (see docs/operations.md) only start once the environment file
# exists, so this restores the database from R2 *before* writing that file. Otherwise the app
# could start with an empty database, and Litestream could replicate it over the backup.
#
# Credentials go in the keychain, and everything else in the environment file. A pasted file
# holding credentials, such as a copy from a password manager, is split between the two, and so
# is an existing environment file that still holds them.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"
env_file="$ENV_FILE"
config_dir="$(dirname "$env_file")"
data_dir="$HOME/.local/share/health-tracking"
port=8787
https_port=8443

say() { printf '\nhealth-tracking: %s\n' "$*"; }

if [ ! -t 0 ]; then
    if [ ! -f "$env_file" ]; then
        echo "Warning: health-tracking isn't set up; run $root/scripts/setup-machine.sh" >&2
    elif has_credentials "$env_file"; then
        echo "Warning: $env_file holds credentials; run $root/scripts/setup-machine.sh to move them into the keychain" >&2
    fi
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

# Sets env_contents to a new environment file, credentials included, from a pasted copy or from
# prompts. Builds it in memory, so credentials are never written to disk.
create_env() {
    local answer
    echo
    echo "No settings file at $env_file."
    echo "  p) Paste a saved copy (e.g. from your password manager)"
    echo "  n) Enter the R2 details now"
    read -rp "Choose [p/n]: " answer
    case "$answer" in
        p)
            echo "Paste the file, then press Ctrl-D on an empty line. It won't be shown, as it holds"
            echo "credentials."
            # Restores the terminal however the script ends, including on Ctrl-C.
            tty_state="$(stty -g)"
            trap 'stty "$tty_state"; rm -f "$pending"' EXIT
            trap 'exit 130' INT
            trap 'exit 143' TERM
            stty -echo
            env_contents="$(cat)"
            stty "$tty_state"
            trap 'rm -f "$pending"' EXIT
            trap - INT TERM
            echo "Read $(printf '%s\n' "$env_contents" | grep -c .) lines."
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
            # Not a here-document: bash 3.2 writes those to a temporary file.
            printf -v env_contents '%s\n' \
                "# Private settings for the health-tracking app. Never commit or share this file." \
                "# Credentials are in the keychain; see docs/operations.md." \
                "HEALTH_DATA_DIR=$data_dir" \
                "LITESTREAM_CONFIG=$root/deploy/litestream.yml" \
                "LITESTREAM_ENDPOINT=https://$account.r2.cloudflarestorage.com" \
                "LITESTREAM_ACCESS_KEY_ID=$key_id" \
                "LITESTREAM_SECRET_ACCESS_KEY=$secret" \
                "LITESTREAM_SSE_CUSTOMER_KEY=$sse"
            ;;
        *) die "expected p or n" ;;
    esac
}

mkdir -p "$config_dir" "$data_dir"
# Separately from mkdir, whose -m only applies to directories it creates.
chmod 700 "$config_dir" "$data_dir"

umask 077

if [ ! -f "$env_file" ]; then
    pending="$(mktemp "$config_dir/env.pending.XXXXXX")"
    trap 'rm -f "$pending"' EXIT
    create_env
    move_credentials "$env_contents" "$pending"
    unset env_contents
    require_keys "$pending" HEALTH_DATA_DIR LITESTREAM_CONFIG LITESTREAM_ENDPOINT
    require_credentials

    if [ ! -f "$data_dir/health.db" ]; then
        say "restoring the database from R2 (if there is a backup)"
        (
            ENV_FILE="$pending"
            load_env
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
elif has_credentials "$env_file"; then
    say "moving the credentials in $env_file into the keychain"
    # The keychain only lives on this Mac, and without this key the R2 backups can't be read.
    if grep -Eq '^LITESTREAM_SSE_CUSTOMER_KEY=.' "$env_file"; then
        echo "Make sure LITESTREAM_SSE_CUSTOMER_KEY from $env_file is saved off this Mac, such as in"
        echo "your password manager: without it, the R2 backups can't be read."
        read -rp "Is it saved there? [y/N] " answer
        [ "$answer" = y ] || [ "$answer" = Y ] || die "nothing changed; save the key, then run this again"
    fi
    pending="$(mktemp "$config_dir/env.pending.XXXXXX")"
    trap 'rm -f "$pending"' EXIT
    move_credentials "$(cat "$env_file")" "$pending"
    # Replaced in one step, so the background services never see the file missing.
    mv "$pending" "$env_file"
    trap - EXIT
    say "removed the credentials from $env_file. Running services keep the ones they started with, and read the keychain from their next restart, such as the next deploy."
fi

require_keys "$env_file" HEALTH_DATA_DIR LITESTREAM_CONFIG LITESTREAM_ENDPOINT
require_credentials

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

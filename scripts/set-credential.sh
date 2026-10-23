#!/usr/bin/env bash
# Stores one credential in the keychain, replacing any existing value. Reads it from a hidden
# prompt, or from stdin when that isn't a terminal, so it never appears in argv or shell history.
# With --delete, removes it instead, e.g. to turn off the Google Drive export.
#
# Usage: scripts/set-credential.sh [--delete] <variable>, e.g. GOOGLE_OAUTH_REFRESH_TOKEN
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib.sh
source "$root/scripts/lib.sh"

usage="usage: scripts/set-credential.sh [--delete] <variable>"
delete=false
if [ "${1:-}" = --delete ]; then
    delete=true
    shift
fi
[ $# -eq 1 ] || die "$usage"
name="$1"
is_credential "$name" || die "$name isn't a credential; expected one of: ${CREDENTIALS[*]}"

if [ "$delete" = true ]; then
    credential_delete "$name"
    echo "Deleted $name from the keychain."
    exit 0
fi

if [ -t 0 ]; then
    read -rsp "$name (hidden): " value
    echo
    read -rsp "Again, to confirm: " again
    echo
    [ "$value" = "$again" ] || die "the values didn't match, so nothing was stored"
else
    value="$(cat)"
fi
credential_write "$name" "$value"
echo "Stored $name in the keychain as $(keychain_service "$name")."

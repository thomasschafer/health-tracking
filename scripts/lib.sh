# shellcheck shell=bash
# Shared helpers for the scripts in this directory. Source, don't execute.
#
# The background services run these scripts with macOS's bash 3.2, so they must work there. In
# that version, here-strings and here-documents go through temporary files, so never use them
# for anything holding a credential.

SERVER_LABEL="org.nix-community.home.health-tracking-server"
ENV_FILE="${HEALTH_ENV_FILE:-$HOME/.config/health-tracking/env}"

die() {
    echo "health-tracking: error: $*" >&2
    exit 1
}

# Credentials live in the login keychain rather than ENV_FILE, one item per variable, named
# <prefix>.<variable>. HEALTH_KEYCHAIN_PREFIX changes the prefix, e.g. to try setup without
# touching the real items.
KEYCHAIN_PREFIX="${HEALTH_KEYCHAIN_PREFIX:-health-tracking}"
KEYCHAIN_ACCOUNT="$(id -un)"
REQUIRED_CREDENTIALS=(LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY LITESTREAM_SSE_CUSTOMER_KEY)
# For the optional Google Drive export. The server checks that all three are set, or none.
OPTIONAL_CREDENTIALS=(GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REFRESH_TOKEN)
CREDENTIALS=("${REQUIRED_CREDENTIALS[@]}" "${OPTIONAL_CREDENTIALS[@]}")

SECURITY=/usr/bin/security
KEYCHAIN_ITEM_NOT_FOUND=44

# The names go into a `security -i` command line, so they may only use characters that need no
# quoting there. Checked here rather than per lookup, as a check inside a command substitution
# can't stop the script.
for name in "$KEYCHAIN_PREFIX" "$KEYCHAIN_ACCOUNT"; do
    [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || die "unsafe keychain prefix or account name '$name'"
done
unset name

# Puts the background service's tools (Node, Litestream) first on PATH, so scripts use exactly
# what the service does. Native modules only load under the Node version they were built for.
use_service_path() {
    local plist="$HOME/Library/LaunchAgents/$SERVER_LABEL.plist"
    if [ -f "$plist" ]; then
        PATH="$(plutil -extract EnvironmentVariables.PATH raw "$plist"):$PATH"
        export PATH
    fi
}

# Usage: is_credential <variable>
is_credential() {
    local name
    for name in "${CREDENTIALS[@]}"; do
        [ "$name" = "$1" ] && return 0
    done
    return 1
}

# Usage: keychain_service <variable>
keychain_service() {
    printf '%s.%s' "$KEYCHAIN_PREFIX" "$1"
}

# Usage: keychain_failure <service> <exit code>
# Explains why looking up an item failed. Looks it up again without -w, so the value isn't
# fetched, to get the error message.
keychain_failure() {
    local service="$1" status="$2" error
    error="$("$SECURITY" find-generic-password -s "$service" -a "$KEYCHAIN_ACCOUNT" 2>&1 >/dev/null || true)"
    case "$(printf '%s' "$error" | tr '[:upper:]' '[:lower:]')" in
        *"interaction is not allowed"*) die "the keychain is locked, so $service can't be read" ;;
    esac
    die "security exited $status reading $service: $error"
}

# Usage: credential_read <variable>
# Sets credential_value to the variable's value from the keychain. Returns 1 if there's no item,
# and fails on anything else, such as a locked keychain or an empty item. Sets a variable rather
# than printing, so it doesn't run in a subshell and its failures stop the script.
credential_read() {
    local service status=0
    is_credential "$1" || die "$1 isn't a credential"
    service="$(keychain_service "$1")"
    credential_value="$("$SECURITY" find-generic-password -s "$service" -a "$KEYCHAIN_ACCOUNT" -w 2>/dev/null)" ||
        status=$?
    case "$status" in
        0) ;;
        "$KEYCHAIN_ITEM_NOT_FOUND")
            credential_value=""
            return 1
            ;;
        *) keychain_failure "$service" "$status" ;;
    esac
    [ -n "$credential_value" ] || die "keychain item $service is empty"
}

# Usage: credential_exists <variable>
credential_exists() {
    local service status=0
    is_credential "$1" || die "$1 isn't a credential"
    service="$(keychain_service "$1")"
    "$SECURITY" find-generic-password -s "$service" -a "$KEYCHAIN_ACCOUNT" >/dev/null 2>&1 || status=$?
    case "$status" in
        0) return 0 ;;
        "$KEYCHAIN_ITEM_NOT_FOUND") return 1 ;;
        *) keychain_failure "$service" "$status" ;;
    esac
}

# Usage: check_credential_value <variable> <value>
# Allows only values that read back from the keychain as written, and that mean the same whether
# an environment file holding them is sourced by bash or read by Node.
check_credential_value() {
    local LC_ALL=C
    [ -n "$2" ] || die "$1 is empty"
    [[ "$2" =~ ^[!-~]+$ ]] || die "$1 must be printable ASCII with no spaces"
    case "$2" in
        *[\'\"\\\$\`]*) die "$1 must not contain quotes, backslashes, \$ or backticks" ;;
    esac
}

# Usage: credential_write <variable> <value>
# Creates or replaces the item, then reads it back to confirm. Function arguments aren't visible
# to other processes, and `security -i` reads its command from stdin rather than argv. Hex
# encoding sidesteps its quoting rules.
credential_write() {
    local name="$1" value="$2" service hex status=0
    is_credential "$name" || die "$name isn't a credential"
    check_credential_value "$name" "$value"
    service="$(keychain_service "$name")"
    hex="$(printf '%s' "$value" | od -An -tx1 | tr -d ' \n')"
    printf 'add-generic-password -U -s %s -a %s -X %s\n' "$service" "$KEYCHAIN_ACCOUNT" "$hex" |
        "$SECURITY" -i >/dev/null 2>&1 || status=$?
    [ "$status" -eq 0 ] || die "security exited $status storing $service"
    credential_read "$name" || die "keychain item $service is missing after storing it"
    [ "$credential_value" = "$value" ] || die "keychain item $service didn't read back as written"
    unset credential_value
}

# Usage: credential_delete <variable>
# Deletes the item. Fails if there's no item, as the caller meant to remove something.
credential_delete() {
    local service status=0
    is_credential "$1" || die "$1 isn't a credential"
    service="$(keychain_service "$1")"
    "$SECURITY" delete-generic-password -s "$service" -a "$KEYCHAIN_ACCOUNT" >/dev/null 2>&1 || status=$?
    case "$status" in
        0) ;;
        "$KEYCHAIN_ITEM_NOT_FOUND") die "no keychain item $service to delete" ;;
        *) die "security exited $status deleting $service" ;;
    esac
    ! credential_exists "$1" || die "keychain item $service is still there after deleting it"
}

# Usage: require_credentials
require_credentials() {
    local name
    for name in "${REQUIRED_CREDENTIALS[@]}"; do
        credential_exists "$name" ||
            die "no keychain item $(keychain_service "$name"); run scripts/setup-machine.sh"
    done
}

# Usage: credential_pattern
# Prints an extended regex matching a line that sets a credential, in any form bash accepts.
credential_pattern() {
    local IFS='|'
    printf '^[[:space:]]*(export[[:space:]]+)?(%s)[[:space:]]*=' "${CREDENTIALS[*]}"
}

# Usage: has_credentials <file>
has_credentials() {
    grep -Eq "$(credential_pattern)" "$1"
}

# Usage: move_credentials <environment file contents> <output file>
# Stores each credential in the contents in the keychain, replacing any existing item, and
# writes everything else to the output file. Comment lines directly above a credential describe
# it, so they go with it. An empty credential means unset, so it's dropped, but it's refused if
# the keychain holds a value for it, as keeping that value would contradict the file. Checks every
# line before storing anything, and writes the output file last.
move_credentials() {
    local contents="$1" out="$2" pattern line name value i
    local -a kept=() comments=() seen=() names=() values=()
    local LC_ALL=C
    pattern="$(credential_pattern)"
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[[:space:]]*# ]]; then
            comments+=("$line")
            continue
        fi
        if [[ "$line" =~ ^([A-Z_]+)=(.*)$ ]] && is_credential "${BASH_REMATCH[1]}"; then
            name="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            comments=()
            case " ${seen[*]-} " in
                *" $name "*) die "$name is set more than once" ;;
            esac
            seen+=("$name")
            if [ -n "$value" ]; then
                check_credential_value "$name" "$value"
                names+=("$name")
                values+=("$value")
            elif credential_exists "$name"; then
                die "$name is empty here but set in the keychain; remove the line to keep the keychain value, or run scripts/set-credential.sh --delete $name"
            fi
            continue
        fi
        if [[ "$line" =~ $pattern ]]; then
            die "unsupported line setting ${BASH_REMATCH[2]}; use the form NAME=value"
        fi
        kept+=(${comments[@]+"${comments[@]}"} "$line")
        comments=()
    done < <(printf '%s\n' "$contents")
    kept+=(${comments[@]+"${comments[@]}"})

    if [ "${#names[@]}" -gt 0 ]; then
        for i in "${!names[@]}"; do
            name="${names[$i]}"
            if credential_read "$name" && [ "$credential_value" != "${values[$i]}" ]; then
                echo "Replacing the keychain item $(keychain_service "$name"), which held a different value."
            fi
            credential_write "$name" "${values[$i]}"
            echo "Stored $name in the keychain as $(keychain_service "$name")."
        done
    fi
    if [ "${#kept[@]}" -gt 0 ]; then
        printf '%s\n' "${kept[@]}" >"$out"
    else
        : >"$out"
    fi
}

# Usage: load_env
# Exports the settings in ENV_FILE and the credentials in the keychain. Refuses an ENV_FILE that
# still holds credentials, so a stale copy can't be used without anyone noticing. Unsets optional
# credentials that aren't in the keychain, so one inherited from the calling shell isn't used.
load_env() {
    local name
    [ -f "$ENV_FILE" ] || die "missing $ENV_FILE; run scripts/setup-machine.sh"
    if has_credentials "$ENV_FILE"; then
        die "$ENV_FILE holds credentials; run scripts/setup-machine.sh to move them into the keychain"
    fi
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
    for name in "${REQUIRED_CREDENTIALS[@]}"; do
        credential_read "$name" ||
            die "no keychain item $(keychain_service "$name"); run scripts/setup-machine.sh"
        export "$name=$credential_value"
    done
    for name in "${OPTIONAL_CREDENTIALS[@]}"; do
        if credential_read "$name"; then
            export "$name=$credential_value"
        else
            unset "$name"
        fi
    done
    unset credential_value
}

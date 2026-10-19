# shellcheck shell=bash
# Shared helpers for the scripts in this directory. Source, don't execute.

SERVER_LABEL="org.nix-community.home.health-tracking-server"
ENV_FILE="${HEALTH_ENV_FILE:-$HOME/.config/health-tracking/env}"

# Puts the background service's tools (Node, Litestream) first on PATH, so scripts use exactly
# what the service does. Native modules only load under the Node version they were built for.
use_service_path() {
    local plist="$HOME/Library/LaunchAgents/$SERVER_LABEL.plist"
    if [ -f "$plist" ]; then
        PATH="$(plutil -extract EnvironmentVariables.PATH raw "$plist"):$PATH"
        export PATH
    fi
}

#!/usr/bin/env bash
#
# Phase 1 of a release for the Pi packages: authenticate against the public npm registry.
# Run it — it takes no arguments.
#
#   ./npm-login.sh
#
# One run resolves the registry, tunnels the hostname when an internal mirror answers for
# it, refuses a login page that belongs to a mirror, then either reports that you are
# already logged in or starts npm's login flow. The browser step is yours: npm prints the
# login URL and waits for you to finish there — no window is opened here, and nothing is
# written until it succeeds. Phase 2 is ./npm-publish.sh (or ./plugins/pi/npm-publish.sh
# from the repository root), which runs this script by itself before it writes anything.
#
# The implementation is shared with the repository root and lives in
# tools/npm-registry/npm-login.sh.
#
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SELF_DIR/$(basename "${BASH_SOURCE[0]}")"

if [ "$PWD" = "$SELF_DIR" ]; then
    hint="./npm-publish.sh"
else
    hint="./plugins/pi/npm-publish.sh"
fi

# No options: the run is the flow described in the header. Anything after the script name
# is a mistake, including a single empty or blank argument, so it prints the usage and
# stops instead of running.
if [ $# -ne 0 ]; then
    printf '%s: arguments are not supported — this script is run with no arguments.\n' \
        "$(basename "$SELF")" >&2
    printf '   received %s argument(s), first one: [%s]\n\n' "$#" "${1-}" >&2
    awk 'NR > 1 { if ($0 ~ /^set -euo/) exit; sub(/^# ?/, ""); print }' "$SELF" >&2
    exit 2
fi

exec env NPM_PUBLISH_HINT="$hint" "$SELF_DIR/../../tools/npm-registry/npm-login.sh"

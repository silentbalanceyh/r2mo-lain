#!/usr/bin/env bash
#
# Phase 1 of a release: authenticate against the npm registry. Takes no arguments.
#
#   ./npm-login.sh              (or ./plugins/pi/npm-login.sh)
#
# What one run does, in this order:
#
#   1. resolves the registry npm would use; when an internal mirror answers for
#      registry.npmjs.org, that hostname goes through the public-DNS tunnel, so the real
#      registry — not the mirror — answers every request that follows
#   2. asks the registry which login page it would hand to a browser and stops with an
#      error when that page belongs to a mirror: a session token issued by an npmmirror
#      host is useless against npmjs, and npm would store it over a working token
#   3. reports the current login, or starts npm's own login flow and verifies the result
#      afterwards. The browser step is yours: npm prints the login URL and waits, and you
#      open it yourself — no window is opened on this machine.
#
# Running it is never harmful: it writes nothing to your npm config (a token, when one is
# used, goes into a temporary file with mode 600), and when you are already logged in it
# only reports that and stops.
#
# A run without a terminal (CI) picks up $NPM_TOKEN by itself; an interactive run never
# reads that variable, so a plain `./npm-login.sh` always reaches the login page.
#
set -euo pipefail

# Absolute self-reference, so the shared library is found from any working directory.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLISH_HINT="${NPM_PUBLISH_HINT:-./npm-publish.sh}"

REGISTRY="https://registry.npmjs.org/"
PUBLIC_DNS=0
ALLOW_MIRROR=0

# shellcheck source=registry-common.sh
. "$SELF_DIR/registry-common.sh"

if [ $# -ne 0 ]; then
    printf '%s: arguments are not supported — this script is run with no arguments.\n' \
        "$(basename "${BASH_SOURCE[0]}")" >&2
    printf '   received %s argument(s), first one: [%s]\n' "$#" "${1-}" >&2
    printf '   it checks the registry login and starts npm login when that is needed; the\n   comment block at the top of the file describes one run.\n' >&2
    exit 2
fi

npm_resolve_registry
npm_resolve_token_env
npm_trap_cleanup
npm_start_proxy
npm_registry_guard hard

info "registry authentication"
npm_auth_args
if [ "$TOKEN_PRESENT" = "1" ]; then
    ok "    using the token from \$$TOKEN_ENV (temporary file, chmod 600)"
fi

WHOAMI="$(npm_whoami)"
if npm_logged_in "$WHOAMI"; then
    ok "    logged in as $WHOAMI"
    echo
    ok "phase 1 done — now run: $PUBLISH_HINT"
    exit 0
fi

if [ "$TOKEN_PRESENT" = "1" ] || [ ! -t 0 ] || [ ! -t 1 ]; then
    npm_auth_die "$WHOAMI" "./npm-login.sh"
fi

warn "    not logged in to $REGISTRY — starting npm's own login flow"
info "registry login page"
npm_login_guard hard
warn "    the browser step is yours: npm prints the login URL and waits for you to finish
    there, and this script verifies the result afterwards"
# --browser=false is npm's own switch for "print the URL, do not open a browser": the run
# stays in your hands instead of opening a window on this machine.
npm login "--registry=$REGISTRY" --browser=false ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} || true

WHOAMI="$(npm_whoami)"
if npm_logged_in "$WHOAMI"; then
    ok "    logged in as $WHOAMI"
    echo
    ok "phase 1 done — now run: $PUBLISH_HINT"
    exit 0
fi

die "login did not complete:

      $WHOAMI

    Nothing was written. Run it again — the script itself is always run with no
    arguments:

      ./npm-login.sh
"

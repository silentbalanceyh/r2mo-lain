# shellcheck shell=bash
#
# Shared registry helpers for the two release entry points in this repository:
# `./npm-login.sh` + `./npm-publish.sh` at the root (package `r2mo-ai`) and the same pair
# under `plugins/pi/` (the `r2mopi-*` family). Sourced, never executed directly.
#
# The caller keeps `set -euo pipefail` on, may preset REGISTRY / TOKEN_ENV / PUBLIC_DNS /
# ALLOW_MIRROR, and sources the publish engine next.
#
# Three problems this library solves, all of them observed on real corporate networks:
#
#   1. registry.npmjs.org resolves to an internal npm mirror, so `npm login` and
#      `npm publish` silently talk to that mirror (it even serves its own
#      /-/v1/login URL, which is why a browser login can point at a mirror).
#   2. npm's config can point at a mirror while a publish is supposed to reach the
#      public registry.
#   3. credentials must never land in the shared config file, and a rejected token
#      must abort before anything is written.

NPM_SHARED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGISTRY="${REGISTRY:-https://registry.npmjs.org/}"
TOKEN_ENV="${TOKEN_ENV:-}"
PUBLIC_DNS="${PUBLIC_DNS:-0}"
ALLOW_MIRROR="${ALLOW_MIRROR:-0}"

info() { printf '\033[36m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die() {
    printf '\033[31m%s\033[0m\n' "$*" >&2
    exit 1
}

REGISTRY_HOST=""
REGISTRY_STATE=""
REGISTRY_DETAIL=""
REGISTRY_PROBE=""
MIRRORED=0
PROXY_PID=""
PROXY_PORT=""
AUTH_FILE=""
AUTH_ARGS=()
TOKEN_PRESENT=0
MIRRORED_INITIAL=0

# --------------------------------------------------------------- registry host

# Resolve the registry hostname and remember what the system resolver answered.
npm_resolve_registry() {
    REGISTRY_HOST="$(node -e 'console.log(new URL(process.argv[1]).host)' "$REGISTRY" 2>/dev/null || true)"
    [ -n "$REGISTRY_HOST" ] || die "could not parse the registry URL: $REGISTRY"

    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    REGISTRY_LOOKUP="$(node -e '
const dns = require("dns");
const url = new URL(process.argv[1]);
const host = url.hostname;
dns.lookup(host, (err, address) => {
    if (err) {
        console.log(`unresolved|${host} -> unresolvable`);
        return;
    }
    const isPrivate = address === "::1"
        || /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(address);
    const state = isPrivate ? "mirror" : "public";
    console.log(`${state}|${host} -> ${address}${isPrivate ? " (private/mirror)" : ""}`);
});
' "$REGISTRY" 2>/dev/null || echo "unresolved|lookup failed for $REGISTRY")"
    REGISTRY_STATE="${REGISTRY_LOOKUP%%|*}"
    REGISTRY_DETAIL="${REGISTRY_LOOKUP#*|}"
}

# Probe the registry over HTTP, so detection does not depend on how it is pinned: the
# real registry answers the root path with {}, while npm mirrors answer with an index.
npm_probe_registry() {
    REGISTRY_PROBE="$(curl -sS --max-time 10 "$REGISTRY" 2>/dev/null | head -c 200 || true)"
    MIRRORED=0
    case "$REGISTRY_PROBE" in
    *doc_count* | *last_package*) MIRRORED=1 ;;
    esac
    if [ "$MIRRORED" = "0" ] && [ "$REGISTRY_STATE" = "mirror" ] && [ "$PUBLIC_DNS" = "0" ]; then
        MIRRORED=1
    fi
}

# $1 = hard | soft
#   hard: a mirror answering the official hostname is fatal (login / publish paths)
#   soft: warn only (read-only paths that merely display registry state)
#
# A mirror is not just reported, it is fixed: the one hostname is tunnelled to the real
# registry, so the scripts work with no arguments at all.
npm_registry_guard() {
    local mode="${1:-hard}"
    info "registry host"
    printf '    %s\n' "$REGISTRY_DETAIL"

    # Called from the publish engine after the parent already tunnelled the hostname: the
    # proxy environment is inherited, so there is nothing left to set up here.
    if [ "${NPM_REGISTRY_TUNNEL:-0}" = "1" ]; then
        ok "    already tunnelled to the real registry by the calling script"
        MIRRORED_INITIAL=1
        return 0
    fi

    npm_probe_registry
    MIRRORED_INITIAL="$MIRRORED"

    [ "$MIRRORED" = "1" ] || return 0

    if [ "$PUBLIC_DNS" = "1" ]; then
        warn "    the system resolver still points at an internal mirror; npm goes through
    the public-registry proxy instead of it"
        return 0
    fi
    if [ "$ALLOW_MIRROR" = "1" ]; then
        warn "    mirrored registry, continuing anyway"
        return 0
    fi

    warn "    an internal mirror answers for $REGISTRY_HOST — tunnelling that hostname
    to the real registry"
    PUBLIC_DNS=1
    npm_start_proxy "$mode" || true
    if [ "$PUBLIC_DNS" = "1" ]; then
        npm_resolve_registry
        npm_probe_registry
        if [ "$MIRRORED" = "0" ]; then
            ok "    registry host is now the real one"
            echo
            return 0
        fi
        warn "    the tunnel did not reach the real registry either"
    fi

    if [ "$mode" = "soft" ]; then
        warn "    registry answers below may come from the mirror"
        return 0
    fi

    die "$REGISTRY is answered by a mirror, not the public registry:

      $REGISTRY_DETAIL
      probe: $(printf '%s' "$REGISTRY_PROBE" | head -c 60)

    Something on this network (DNS pinning, /etc/hosts, VPN split DNS) answers for
    the official registry hostname, so traffic would land on that mirror — a publish
    would never show up on npmjs or the Pi gallery, and the mirror supplies its own
    /-/v1/login URL, which is why a browser login points somewhere unexpected.

    The tunnel above could not be established. Pick one:
      - point the hostname at the real registry (a hosts entry, or another network), or
      - publish from elsewhere, with the hostname resolving to the registry itself."
}

# -------------------------------------------------------- login-page identity

# Where would the browser be sent? Ask the registry for its web-login page and compare
# the brand of that URL with the brand of the registry host. npm's own login reads this
# same endpoint, so this is exactly the address npm would hand to a browser.
#
#   same:<host>   the page belongs to the registry itself (the normal case)
#   other:<host>  the page belongs to somebody else: a mirror answering with its own
#                 session, which is how a browser login ends up on npmmirror
#   none          the endpoint is not offered (npm falls back to user name / password)
#   error         the endpoint could not be reached at all
#
# The request travels the same tunnel npm does whenever the proxy is up.
npm_registry_identity() {
    local body
    body="$(curl -sS --max-time 10 -X POST "$REGISTRY/-/v1/login" \
        -H 'content-type: application/json' -H 'accept: application/json' \
        -d '{}' 2>/dev/null | head -c 4000 || true)"
    if [ -z "$body" ]; then
        printf 'error'
        return 0
    fi
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    printf '%s' "$body" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
    let loginUrl = null;
    try {
        const parsed = JSON.parse(raw);
        loginUrl = typeof parsed.loginUrl === "string" ? parsed.loginUrl : null;
    } catch {
        loginUrl = null;
    }
    if (!loginUrl) {
        console.log("none");
        return;
    }
    // Second-level label: npmjs.org / npmjs.com -> "npmjs", registry.npmmirror.com ->
    // "npmmirror". Enough to tell the page of a registry from the page of a mirror.
    const brand = (hostname) => hostname.split(".").slice(-2)[0];
    let page;
    try {
        page = new URL(loginUrl).hostname;
    } catch {
        console.log("none");
        return;
    }
    const registry = new URL(process.argv[1]).hostname;
    console.log(brand(page) === brand(registry) ? `same:${page}` : `other:${page}`);
});
' "$REGISTRY"
}

# Refuse to start a browser flow that would not land on the registry itself. This is the
# one place where a mirror can hand out something worse than slow traffic: its own login
# session, whose token the real registry rejects (it also overwrites a working token).
#
# $1 = hard | soft
npm_login_guard() {
    local mode="${1:-hard}" identity kind host
    identity="$(npm_registry_identity)"
    kind="${identity%%:*}"
    host="${identity#*:}"
    case "$kind" in
    same)
        ok "    login page is served by $host (the registry itself)"
        ;;
    none)
        info "    this registry offers no web-login page — npm asks for user name /
    password (plus a one-time password) instead of opening a browser"
        ;;
    other)
        if [ "$MIRRORED_INITIAL" = "1" ] && [ "$ALLOW_MIRROR" = "0" ] && [ "$mode" = "hard" ]; then
            die "the login page would be served by $host, not $REGISTRY_HOST:

      $REGISTRY_DETAIL

    The hostname $REGISTRY_HOST is answered by a mirror on this network, and that
    mirror answers /-/v1/login with a login page of its own ($host). Logging in
    there gives you a token for the mirror, not for the public registry: publishing
    would keep failing, and a working token in your npm config would be replaced.

    Nothing was written and no login was started. Pick one:
      - let the tunnel run (it is automatic and already underway), or
      - point $REGISTRY_HOST at the real registry (a hosts entry, or another
        network), or
      - skip the browser flow: create an access token on the registry website and
        export it as \$NPM_TOKEN for a run without a terminal."
        fi
        warn "    the login page would be served by $host, not by $REGISTRY_HOST"
        ;;
    *)
        warn "    could not check which host serves the login page"
        ;;
    esac
}

# ------------------------------------------------------------- public-DNS proxy
# $1 = hard | soft (soft: a start failure warns instead of aborting)
npm_start_proxy() {
    local mode="${1:-hard}"
    [ "$PUBLIC_DNS" = "1" ] || return 0
    info "public-registry proxy"
    local out err port
    out="$(mktemp "${TMPDIR:-/tmp}/npm-registry-proxy-out.XXXXXX")"
    err="$(mktemp "${TMPDIR:-/tmp}/npm-registry-proxy-log.XXXXXX")"
    node "$NPM_SHARED_DIR/public-registry-proxy.js" --host="$REGISTRY_HOST" --port=0 \
        >"$out" 2>"$err" &
    PROXY_PID=$!
    port=""
    for _ in $(seq 1 40); do
        if [ -s "$out" ]; then
            port="$(head -1 "$out")"
            break
        fi
        kill -0 "$PROXY_PID" 2>/dev/null || break
        sleep 0.25
    done
    if [ -z "$port" ]; then
        sed 's/^/      /' "$err" >&2
        rm -f "$out" "$err"
        kill "$PROXY_PID" 2>/dev/null || true
        wait "$PROXY_PID" 2>/dev/null || true
        PROXY_PID=""
        if [ "$mode" = "soft" ]; then
            PUBLIC_DNS=0
            warn "    the public-registry proxy did not start; continuing without it"
            return 1
        fi
        die "the public-registry proxy did not start"
    fi
    PROXY_PORT="$port"
    export HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"
    export https_proxy="$HTTPS_PROXY"
    export npm_config_https_proxy="$HTTPS_PROXY"
    export npm_config_proxy="$HTTPS_PROXY"
    # Marker for a script this one launches (the publish engine calls npm-login.sh): it
    # inherits both the proxy and this flag, so it does not tunnel a second time.
    export NPM_REGISTRY_TUNNEL=1
    ok "    npm now reaches $REGISTRY_HOST through 127.0.0.1:$PROXY_PORT (public DNS)"
    echo
}

npm_cleanup() {
    if [ -n "$PROXY_PID" ]; then
        kill "$PROXY_PID" 2>/dev/null || true
        wait "$PROXY_PID" 2>/dev/null || true # reap it, so bash stays quiet about the kill
    fi
    [ -n "$AUTH_FILE" ] && rm -f "$AUTH_FILE"
    [ -n "${PUBLISH_LOG:-}" ] && rm -f "$PUBLISH_LOG"
    return 0
}

npm_trap_cleanup() {
    trap 'npm_cleanup' EXIT
}

# ------------------------------------------------------------------ credentials

# Put the token found by npm_resolve_token_env into a temporary npm userconfig (chmod
# 600) so the shared config is never touched. Sets TOKEN_PRESENT.
#
# The token is opt-in on purpose: a no-argument run has to reach the browser login even
# when a stale $NPM_TOKEN is exported, otherwise that token is preferred over a fresh
# login and fails with 401. A run without a TTY (CI) keeps the usual convention and uses
# $NPM_TOKEN by itself.
npm_resolve_token_env() {
    if [ -n "$TOKEN_ENV" ]; then
        [ -n "${!TOKEN_ENV:-}" ] ||
            die "\$$TOKEN_ENV is empty — export it, or unset the variable to log in"
        return 0
    fi
    [ -n "${NPM_TOKEN:-}" ] || return 0
    if [ ! -t 0 ] || [ ! -t 1 ]; then
        TOKEN_ENV="NPM_TOKEN"
        warn "    no TTY: authenticating with \$NPM_TOKEN from the environment"
    else
        warn "    ignoring \$NPM_TOKEN — an interactive run always uses the login page"
        warn "    (unset the variable, or run without a terminal, to use it instead)"
    fi
    return 0
}

npm_auth_args() {
    AUTH_ARGS=()
    TOKEN_PRESENT=0
    [ -n "$TOKEN_ENV" ] || return 0
    local value="${!TOKEN_ENV:-}"
    [ -n "$value" ] || return 0
    AUTH_FILE="$(mktemp "${TMPDIR:-/tmp}/npm-registry-auth.XXXXXX")"
    chmod 600 "$AUTH_FILE"
    printf 'registry=%s\n//%s/:_authToken=%s\n' "$REGISTRY" "$REGISTRY_HOST" "$value" >"$AUTH_FILE"
    AUTH_ARGS=("--userconfig=$AUTH_FILE")
    TOKEN_PRESENT=1
    return 0
}

# Last meaningful line of `npm whoami` (its log-path notice is noise).
npm_whoami() {
    npm whoami --registry="$REGISTRY" ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} 2>&1 |
        grep -vE 'complete log of this run|^npm (notice|warn)' | tail -1 || true
}

# $1 = output of npm_whoami
npm_logged_in() {
    local who="$1"
    [ -n "$who" ] || return 1
    printf '%s' "$who" | grep -qiE '^(npm )?(error|e401|e403|unauthorized)' && return 1
    printf '%s' "$who" | grep -q ' ' && return 1
    return 0
}

# Die with a message that matches the failure (bad token vs no credentials).
npm_auth_die() {
    local who="$1" retry="$2"
    if [ "$TOKEN_PRESENT" = "1" ]; then
        die "the token in \$$TOKEN_ENV was rejected by $REGISTRY:

      $who

    Nothing was written and nothing was published.

    Check that it is an npm access token with publish rights (Automation or Granular),
    created at https://www.npmjs.com/settings/<your-user>/tokens. A token issued for an
    internal mirror does not work against the public registry."
    fi
    die "not logged in to $REGISTRY:

      $who

    Nothing was written and nothing was published.

    Run it again — the script itself is always run with no arguments:
      $retry"
}

# --------------------------------------------------------------- publish helpers
#
# Shared by both release entry points; the engine above them only decides WHICH packages
# are being released and what a publishable package looks like.

# Is that exact version already on the registry? Silent — the printed section comes later.
npm_registry_version() {
    npm view "$1@$2" version --registry="$REGISTRY" 2>/dev/null || true
}

# The latest version the registry knows for a package (its `latest` dist-tag). Used to keep
# an automatic bump above what is already out, even when the working tree lags behind.
npm_registry_latest() {
    npm view "$1" version --registry="$REGISTRY" 2>/dev/null | tail -1 || true
}

# X.Y.Z + patch|minor|major -> the bumped version, via node so no shell arithmetic or
# BSD sort quirk can mangle it.
npm_bump_version() {
    local base="$1" kind="$2"
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    node -e '
const [base, kind] = process.argv.slice(1);
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(base);
if (!m) { console.error("not a plain semver version: " + base); process.exit(1); }
let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (kind === "major") { maj += 1; min = 0; pat = 0; }
else if (kind === "minor") { min += 1; pat = 0; }
else { pat += 1; }
console.log(`${maj}.${min}.${pat}`);
' "$base" "$kind"
}

# Highest of the given versions (again via node: a BSD sort may lack -V).
npm_highest_version() {
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    node -e '
const versions = process.argv.slice(1);
const cmp = (a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
};
console.log(versions.sort(cmp).at(-1));
' "$@"
}

npm_publish_log_open() {
    [ -n "${PUBLISH_LOG:-}" ] ||
        PUBLISH_LOG="$(mktemp "${TMPDIR:-/tmp}/npm-registry-publish.XXXXXX")"
}

# One quiet publish attempt, for a run without a terminal. The one-time password travels
# in the environment (npm_config_otp) instead of an argument, so it never lands in npm's own
# debug logs. --browser=false is npm's own switch for "print the URL, do not open a
# browser": even here the browser step stays with the person running the release.
# $1 = package directory, remaining arguments are extra npm flags.
npm_publish_attempt() {
    local dir="$1"
    shift
    npm_publish_log_open
    : >"$PUBLISH_LOG"
    if [ -n "${OTP:-}" ]; then
        (cd "$dir" && npm_config_otp="$OTP" npm publish --registry="$REGISTRY" --browser=false ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "$@") >"$PUBLISH_LOG" 2>&1
    else
        (cd "$dir" && npm publish --registry="$REGISTRY" --browser=false ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "$@") >"$PUBLISH_LOG" 2>&1
    fi
}

# npm asks for a one-time password when the account's 2FA covers writes as well.
npm_publish_needs_otp() {
    grep -qE 'EOTP|one-time password|requires a one-time' "${PUBLISH_LOG:-/dev/null}"
}

# The one attempt that matters when a person is sitting in front of it: npm inherits the
# terminal, so it prints its own prompt — a code, or the URL to confirm in a browser, which
# it then waits for — and there is no second attempt that would start a new session on top
# of the confirmation you just made. --browser=false keeps it from opening a window.
npm_publish_attempt_interactive() {
    local dir="$1"
    shift
    (cd "$dir" && npm publish --registry="$REGISTRY" --browser=false ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "$@")
}

# Where npm told you to confirm the release in a browser, if it did. Not actionable from a
# run that already ended — it shows why the release needs a terminal.
npm_publish_auth_urls() {
    [ -s "${PUBLISH_LOG:-}" ] || return 1
    grep -oE 'https://[^ ]+/auth/cli/[A-Za-z0-9_-]+' "$PUBLISH_LOG" | sort -u | sed 's/^/      /'
}

# Show what npm said when an attempt failed (its wording beats ours).
npm_publish_log_tail() {
    [ -s "${PUBLISH_LOG:-}" ] || return 0
    tail -12 "$PUBLISH_LOG" | sed 's/^/      /'
}

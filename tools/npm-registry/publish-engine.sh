# shellcheck shell=bash
#
# Shared publish engine for the two release entry points in this repository:
#
#   ./npm-publish.sh             the package `r2mo-ai` at the repository root
#   ./plugins/pi/npm-publish.sh  the `r2mopi-*` family under plugins/pi/
#
# Sourced, never executed directly, and it takes no arguments: the entry script sets the
# variables below and the three hooks, then sources this file. One run is the whole flow.
#
#   NPM_SET_DIR       directory the run happens in (the entry's own directory)
#   NPM_SET_LABEL     heading printed above the package list
#   NPM_LOGIN         absolute path of the entry's npm-login.sh
#   NPM_PUBLISH_HINT  command named in the "do this next" and "run it again" hints
#
#   npm_discover_packages        fills PKG_DIRS
#   npm_preflight_package <dir>  prints why and returns non-zero when a package is not
#                                publishable
#   npm_footer <version>         closing hints after a successful release
#   npm_git_release <version>    optional, and the only way a run commits anything: an
#                                entry whose release should end with a commit and a push
#                                defines it (the root package does). plugins/pi/ defines
#                                nothing, so its release never touches git.
#
# What one run does, in this order:
#
#   1. resolves the registry npm would use, and when an internal mirror answers for the
#      hostname, sends it through the public-DNS tunnel so the real registry answers —
#      before anything is queried, so no decision is ever taken against the mirror
#   2. decides the version for the whole set: the highest of the local version and the
#      registry's latest, raised by one patch when that version is already published. The
#      registry is asked directly, in a private cache, so no cached packument of an earlier
#      run can make a version that is already out look like a first release
#   3. preflight, then phase 1 authentication (npm-login.sh) — before anything is written,
#      so a failed login leaves the working tree and the registry untouched
#   4. writes the version into every package.json, and into a lock file when one exists
#   5. publishes. Anything npm needs from you — a one-time password, a browser
#      confirmation — it prints and waits for, and you finish it; nothing is opened or
#      clicked for you, and no second attempt starts a fresh session behind your back
#   6. commits and pushes, unless this package set publishes without git
#
# There are no options to pass: what one run does is fixed here, and an argument is a
# mistake rather than a mode.
#
# What one run must not do: write anything before authentication, or commit anything when
# publishing failed. Both are handled by the order below.

set -euo pipefail

cd "${NPM_SET_DIR:?NPM_SET_DIR must be set by the entry script}"

# Defence in depth: the entry refuses arguments before it gets here, and this refuses them
# again, so no path into the engine can carry an option.
if [ $# -ne 0 ]; then
    printf 'publish engine: arguments are not supported (%s received, first one: [%s]).\n' \
        "$#" "${1-}" >&2
    exit 2
fi

REGISTRY="https://registry.npmjs.org/"
OTP="${NPM_OTP:-}"

# git is structure here, never a switch: an entry that defines npm_git_release gets a commit
# and a push out of a complete release, an entry that defines nothing never touches git.
# There is no flag and no variable for either behaviour.
GIT_HOOK=0
declare -F npm_git_release >/dev/null 2>&1 && GIT_HOOK=1

# The entry sources registry-common.sh before this file, so every npm_* helper below
# (registry guard, tunnel, credentials, publish attempts) is already in scope.

npm_resolve_registry
npm_trap_cleanup
npm_isolate_cache

# The registry guard runs BEFORE any npm traffic: it probes the hostname, and when an
# internal mirror answers for it, it brings up the public-DNS tunnel. Version queries below
# must already travel the same route as the publish does, otherwise the decision would be
# made against the mirror while the publish goes to the real registry.
npm_registry_guard hard
echo

# ------------------------------------------------------------------- discovery

PKG_DIRS=()
npm_discover_packages

[ "${#PKG_DIRS[@]}" -gt 0 ] || die "no packages found for $NPM_SET_LABEL"

pkg_field() { node -p "require('./$1/package.json').$2" 2>/dev/null; }
pkg_name() { pkg_field "$1" "name"; }
pkg_ver() { pkg_field "$1" "version"; }

# ---------------------------------------------------------------- version plan

CURRENT_VERSIONS=()
for dir in "${PKG_DIRS[@]}"; do
    CURRENT_VERSIONS+=("$(pkg_ver "$dir")")
done

UNIQUE="$(printf '%s\n' "${CURRENT_VERSIONS[@]}" | sort -u)"
DRIFT=0
[ "$(printf '%s\n' "$UNIQUE" | wc -l | tr -d ' ')" -gt 1 ] && DRIFT=1

# highest local version, via node so a BSD sort without -V still works
HIGHEST="$(npm_highest_version "${CURRENT_VERSIONS[@]}")"
[ -n "$HIGHEST" ] || die "could not read the current package versions"

# The release target may never be a version that is already out, and never lower than what
# the registry already has — so BASE is the highest of the two, and the version is raised by
# one patch when BASE itself is taken. That is the whole automatic bump: no switch to pass,
# and a tree that lags behind the registry still moves forward instead of colliding.
BASE_VERSION="$HIGHEST"
for dir in "${PKG_DIRS[@]}"; do
    registry_latest="$(npm_registry_latest "$(pkg_name "$dir")")"
    case "$registry_latest" in
    [0-9]*.[0-9]*.[0-9]*) BASE_VERSION="$(npm_highest_version "$BASE_VERSION" "$registry_latest")" ;;
    esac
done

BASE_PUBLISHED=0
for dir in "${PKG_DIRS[@]}"; do
    if [ -n "$(npm_registry_version "$(pkg_name "$dir")" "$BASE_VERSION")" ]; then
        BASE_PUBLISHED=1
    fi
done

if [ "$BASE_PUBLISHED" = "1" ]; then
    TARGET_VERSION="$(npm_bump_version "$BASE_VERSION" patch)"
    PLAN_NOTE="$BASE_VERSION is already on the registry — raised to $TARGET_VERSION"
elif [ "$DRIFT" = "1" ]; then
    TARGET_VERSION="$BASE_VERSION"
    PLAN_NOTE="syncing every package to $TARGET_VERSION"
else
    TARGET_VERSION="$BASE_VERSION"
    PLAN_NOTE="$BASE_VERSION is not on the registry yet — publishing it as the release"
fi

info "$NPM_SET_LABEL"
for dir in "${PKG_DIRS[@]}"; do
    printf '    %-28s %s@%s\n' "$(pkg_name "$dir")" "$(pkg_name "$dir")" "$(pkg_ver "$dir")"
done
echo

if [ "$DRIFT" = "1" ]; then
    warn "version drift detected — packages are not on the same version:"
    for i in "${!PKG_DIRS[@]}"; do
        printf '    %-28s %s\n' "${PKG_DIRS[$i]}" "${CURRENT_VERSIONS[$i]}"
    done
    warn "    syncing every package to $TARGET_VERSION"
    echo
fi

info "release plan"
printf '    version: %s -> %s\n' "$HIGHEST" "$TARGET_VERSION"
printf '    %s\n' "$PLAN_NOTE"
printf '    every package -> %s\n' "$TARGET_VERSION"
if [ "$GIT_HOOK" = "1" ]; then
    printf '    git: commit the whole working tree (git add -A) and push after a complete release\n'
else
    printf '    git: this package set publishes without committing\n'
fi
echo

# ------------------------------------------------------------------- preflight

info "preflight"
for dir in "${PKG_DIRS[@]}"; do
    npm_preflight_package "$dir" || die "preflight failed for $dir"
    printf '    %-28s ok\n' "$(pkg_name "$dir")"
done
echo

# ------------------------------------------------------------------- auth gate
#
# Phase 1 runs before any file is written, so a failed login leaves the working tree and
# the registry untouched. The login script takes no arguments; it decides by itself
# whether it has to start npm's browser flow.

if ! "${NPM_LOGIN:-$NPM_SET_DIR/npm-login.sh}"; then
    die "phase 1 (npm-login.sh) did not succeed — nothing was written and nothing was published"
fi

# ----------------------------------------------------------- write new versions

if [ "$(pkg_ver "${PKG_DIRS[0]}")" != "$TARGET_VERSION" ] || [ "$DRIFT" = "1" ]; then
    info "writing version $TARGET_VERSION into every package.json"
fi

for dir in "${PKG_DIRS[@]}"; do
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    node -e '
const fs = require("fs");
const [pkgFile, version] = process.argv.slice(1);
const rewrite = (file, mutate) => {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    mutate(parsed);
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + "\n");
};
rewrite(pkgFile, (pkg) => { pkg.version = version; });
// A lock file that still names the old version is what `npm version` would have fixed
// too, and leaving it behind breaks a later `npm ci`.
const lockFile = `${pkgFile.replace(/package\.json$/, "")}package-lock.json`;
if (fs.existsSync(lockFile)) {
    rewrite(lockFile, (lock) => {
        lock.version = version;
        if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
    });
}
' "$dir/package.json" "$TARGET_VERSION" >/dev/null
done

for dir in "${PKG_DIRS[@]}"; do
    printf '    %-28s %s@%s\n' "$(pkg_name "$dir")" "$(pkg_name "$dir")" "$(pkg_ver "$dir")"
done
echo

# ------------------------------------------------------------------- git step
#
# The old publish.sh ended with `git add .` + commit + push. The root package does the
# same, because its release carries the version bump with it; the plugins/pi set defines no
# hook at all, so its release touches nothing.
#
# $1 = the released version
npm_git_commit_and_push() {
    local version="$1" repo_root branch upstream remotes staged subject

    if ! repo_root="$(git -C "$NPM_SET_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
        info "git step"
        warn "    $NPM_SET_DIR is not inside a git working tree — nothing committed"
        echo
        return 0
    fi

    # The released package names its own commit: the subject comes from the manifest this
    # run publishes, not from a switch anybody has to remember.
    subject="$( (cd "$NPM_SET_DIR" && node -p 'require("./package.json").name') 2>/dev/null || true)"
    [ -n "$subject" ] || subject="release"

    info "git step"
    printf '    staging everything (git add -A)\n'
    git -C "$repo_root" add -A

    staged="$(git -C "$repo_root" diff --cached --name-only)"
    if [ -z "$staged" ]; then
        warn "    nothing to commit — the release files already match HEAD"
        echo
        return 0
    fi

    printf '    staging:\n'
    printf '%s\n' "$staged" | sed 's/^/      /'

    git -C "$repo_root" commit -m "chore(release): $subject $version"
    ok "    committed: chore(release): $subject $version"

    branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
    if [ "$branch" = "HEAD" ]; then
        warn "    detached HEAD — nothing pushed; push the commit by hand from a branch"
        echo
        return 0
    fi

    upstream="$(git -C "$repo_root" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
    if [ -n "$upstream" ]; then
        git -C "$repo_root" push
        ok "    pushed to $upstream"
    else
        remotes="$(git -C "$repo_root" remote)"
        if [ "$(printf '%s\n' "$remotes" | grep -c .)" = "1" ]; then
            git -C "$repo_root" push -u "$remotes" "$branch"
            ok "    pushed to $remotes/$branch (upstream set)"
        else
            warn "    no upstream and several remotes — push by hand: git push -u <remote> $branch"
        fi
    fi
    echo
}

# --------------------------------------------------------------------- publish

info "publishing ${#PKG_DIRS[@]} package(s) at $TARGET_VERSION to $REGISTRY"
printf '    the browser and one-time-password steps are yours: npm prints what it needs and\n    waits for you to finish it\n'
printf '    proceed? [y/N] '
read -r reply || reply=""
case "${reply:-}" in
y | Y | yes | YES) ;;
*) die "aborted (nothing was published; package.json files already carry $TARGET_VERSION)" ;;
esac
echo

PUBLISHED=()
SKIPPED=()
FAILED=()

npm_auth_args

# npm reports a failure far better than we can, so the shared helpers keep the last run's
# output and hand it back through npm_publish_log_tail.
npm_publish_log_open

for dir in "${PKG_DIRS[@]}"; do
    name="$(pkg_name "$dir")"
    ver="$(pkg_ver "$dir")"

    if [ -n "$(npm_registry_version "$name" "$ver")" ]; then
        warn "skip  $name@$ver — already on the registry"
        SKIPPED+=("$name@$ver")
        continue
    fi

    printf '    %s@%s\n' "$name" "$ver"

    # Start this package from a clean log, so a failure message can only ever quote npm's
    # words about this attempt — never an earlier package's one-time-password prompt.
    npm_publish_log_open
    : >"$PUBLISH_LOG"

    # One attempt, and the right one for the situation:
    #   - a one-time password inherited from the environment needs no interaction at all
    #   - with a terminal, npm takes it: it prompts for the code, or prints the URL to
    #     confirm in a browser and waits for you, and finishes in that same session
    #   - without a terminal npm can only try, and has to tell you to run it in one
    published_ok=0
    if [ -n "$OTP" ]; then
        npm_publish_attempt "$dir" && published_ok=1
        if [ "$published_ok" != "1" ] && npm_publish_needs_otp; then
            warn "      that one-time password was refused"
            OTP=""
        fi
    fi
    if [ "$published_ok" != "1" ] && [ -z "$OTP" ]; then
        if [ -t 0 ] && [ -t 1 ]; then
            info "      npm is in charge now — a one-time password or a URL to confirm in your\n      browser is yours to answer, and npm waits for it"
            npm_publish_attempt_interactive "$dir" && published_ok=1
        else
            npm_publish_attempt "$dir" && published_ok=1
        fi
    fi

    if [ "$published_ok" = "1" ]; then
        ok "      published"
        PUBLISHED+=("$name@$ver")
    else
        printf '\033[31m      publish failed\033[0m\n'
        npm_publish_log_tail
        if npm_publish_needs_otp; then
            npm_publish_auth_urls
            printf '      this account needs a one-time password, and npm can only wait for\n      it while it is running in a terminal: run %s again there, and npm\n      prints the URL and waits for you\n' \
                "${NPM_PUBLISH_HINT:-./npm-publish.sh}"
        fi
        FAILED+=("$name@$ver")
    fi
done

echo
ok "release finished at $TARGET_VERSION"
printf '    published: %s\n' "${PUBLISHED[*]:-none}"
[ "${#SKIPPED[@]}" -gt 0 ] && printf '    skipped:   %s\n' "${SKIPPED[*]}"
[ "${#FAILED[@]}" -gt 0 ] && printf '\033[33m    failed:    %s\033[0m\n' "${FAILED[*]}"

# Nothing is committed when publishing failed: the version files stay where they are, so
# the next run picks the same version up and only retries what is missing.
if [ "${#FAILED[@]}" -gt 0 ]; then
    npm_footer "$TARGET_VERSION"
    cat <<EOF
    nothing was committed — fix the failure, then run the same command again:

      ${NPM_PUBLISH_HINT:-./npm-publish.sh}

EOF
    exit 1
fi

# The git step is structure, not a switch: only an entry that defined npm_git_release gets
# a commit and a push out of this run. Everything else is done either way.
[ "$GIT_HOOK" = "1" ] && npm_git_release "$TARGET_VERSION"

npm_footer "$TARGET_VERSION"

#!/usr/bin/env bash
#
# Release the package `r2mo-ai`. Run it — it takes no arguments and does the whole thing.
#
#   ./npm-publish.sh
#
# What one run does, in this order:
#
#   1. resolves the registry, and when an internal mirror answers for registry.npmjs.org,
#      sends that hostname through the public-DNS tunnel so every request that follows
#      reaches the real registry
#   2. decides the version: the current one as it stands while it is not on the registry
#      yet (the first release of it), one patch bump once it is already published
#   3. authenticates first (phase 1, ./npm-login.sh) — nothing is written before that
#      succeeds, so a failed login leaves the working tree and the registry untouched
#   4. writes the version into package.json, and into package-lock.json
#   5. publishes to https://registry.npmjs.org/; a one-time password, when the account
#      needs one, is asked for by npm itself
#   6. commits the whole working tree (git add -A, so the version bump travels with the
#      commit) and pushes to the branch's upstream
#
# Step 6 runs only after every package was published; a failed publish commits nothing, so
# the same command can simply be run again.
#
# The flow is shared with the Pi packages under plugins/pi/ and lives in
# tools/npm-registry/; this file only describes the root package.
#
set -euo pipefail

# ------------------------------------------------------------------- package set
#
# This entry point only describes the set: where the packages live, what a publishable
# member looks like, and which hints to print afterwards. Everything else — version
# policy, registry guard, auth gate, publish loop, git step — comes from
# tools/npm-registry/.

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SELF_DIR/$(basename "${BASH_SOURCE[0]}")"
SHARED_DIR="$SELF_DIR/tools/npm-registry"

NPM_SET_DIR="$SELF_DIR"
NPM_SET_LABEL="the package at the repository root"
NPM_LOGIN="$SELF_DIR/npm-login.sh"
NPM_PUBLISH_HINT="./npm-publish.sh"

# The root release ends with git, and defining this hook is the only way a run commits
# anything: the whole working tree is staged (`git add -A`), committed as
# `chore(release): r2mo-ai <version>` and pushed. There is no flag and no variable for it.
npm_git_release() {
    npm_git_commit_and_push "$1"
}

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

# ---------------------------------------------------------------- package hooks

npm_discover_packages() {
    PKG_DIRS=(".")
}

# Publishable here means: a real name and version, no `private: true`, a files whitelist
# (so the repository itself is never uploaded), the licence and readme npm links to, and
# bin/main entry points that exist.
npm_preflight_package() {
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    node -e '
const fs = require("fs");
const [dir] = process.argv.slice(1);
const pkg = JSON.parse(fs.readFileSync(`${dir}/package.json`, "utf8"));
const problems = [];
const label = pkg.name || dir;
if (!pkg.name) problems.push("missing name");
if (!/^\d+\.\d+\.\d+$/.test(pkg.version || "")) problems.push(`version is not X.Y.Z: ${pkg.version}`);
if (pkg.private === true) problems.push("private: true");
if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    problems.push("no files whitelist (the whole tree would be published)");
}
for (const file of ["README.md", "LICENSE"]) {
    if (!fs.existsSync(`${dir}/${file}`)) problems.push(`no ${file}`);
}
for (const [name, target] of Object.entries(pkg.bin ?? {})) {
    if (!fs.existsSync(`${dir}/${target}`)) problems.push(`bin.${name} points at a missing path: ${target}`);
}
if (pkg.main && !fs.existsSync(`${dir}/${pkg.main}`)) {
    problems.push(`main points at a missing path: ${pkg.main}`);
}
if (problems.length) {
    console.error(problems.map((p) => `    \u2717 ${label}: ${p}`).join("\n"));
    process.exit(1);
}
' "$dir"
}

npm_footer() {
    cat <<EOF

    package:  https://www.npmjs.com/package/r2mo-ai
    install:  npm install -g r2mo-ai

EOF
}

# ------------------------------------------------------------------ the engine

# shellcheck source=tools/npm-registry/registry-common.sh
. "$SHARED_DIR/registry-common.sh"
# shellcheck source=tools/npm-registry/publish-engine.sh
. "$SHARED_DIR/publish-engine.sh"

#!/usr/bin/env bash
#
# Release the Pi packages. Run it — it takes no arguments and does the whole thing.
#
#   ./npm-publish.sh
#
# Every `r2mopi-*` package under this directory shares ONE version and moves forward as a
# family: the first release goes out as it stands, and every later run writes the same new
# version into every package.json before publishing.
#
# What one run does, in this order:
#
#   1. resolves the registry, and when an internal mirror answers for registry.npmjs.org,
#      sends that hostname through the public-DNS tunnel so every request that follows
#      reaches the real registry
#   2. decides the version for the whole family: the current one as it stands while it is
#      not on the registry yet, one patch bump once it is already published
#   3. authenticates first (phase 1, ./npm-login.sh) — nothing is written before that
#      succeeds, so a failed login leaves the working tree and the registry untouched
#   4. writes the version into every package.json
#   5. publishes to https://registry.npmjs.org/. Anything npm needs from you — a one-time
#      password, a browser confirmation — it prints and waits for
#
# Publishing this family does not touch git: these packages ship on their own, and the
# release commit is the one the root package makes (./npm-publish.sh one level up).
#
# The flow is shared with the root package and lives in tools/npm-registry/; this file
# only describes the Pi packages.
#
set -euo pipefail

# ------------------------------------------------------------------- package set
#
# This entry point only describes the set: where the packages live, what a publishable
# member looks like, and which hints to print afterwards. Everything else — version
# policy, registry guard, auth gate, publish loop — comes from tools/npm-registry/.

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$SELF_DIR/$(basename "${BASH_SOURCE[0]}")"
SHARED_DIR="$(cd "$SELF_DIR/../../tools/npm-registry" && pwd)"

NPM_SET_DIR="$SELF_DIR"
NPM_SET_LABEL="packages under plugins/pi/"
# No git hook here on purpose: publishing this set never touches git. Only the root release
# commits and pushes, and it does so through the hook its own entry defines.
NPM_LOGIN="$SELF_DIR/npm-login.sh"
if [ "$PWD" = "$SELF_DIR" ]; then
    NPM_PUBLISH_HINT="./npm-publish.sh"
else
    NPM_PUBLISH_HINT="./plugins/pi/npm-publish.sh"
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

# ---------------------------------------------------------------- package hooks

# Every package this entry owns sits one directory below, as `r2mopi-<feature>`.
npm_discover_packages() {
    while IFS= read -r dir; do
        PKG_DIRS+=("$dir")
    done < <(find . -mindepth 2 -maxdepth 2 -name package.json 2>/dev/null |
        sed -e 's|^\./||' -e 's|/package.json$||' | sort)
}

# Publishable here means: visible to the Pi gallery, with a pi manifest that points at
# files which exist.
npm_preflight_package() {
    # shellcheck disable=SC2016  # JS template literals below, not shell expansion
    node -e '
const fs = require("fs");
const [dir] = process.argv.slice(1);
const pkg = JSON.parse(fs.readFileSync(`${dir}/package.json`, "utf8"));
const problems = [];
if (!pkg.name) problems.push("missing name");
if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("pi-package")) {
    problems.push("missing the \"pi-package\" keyword (the Pi gallery would skip it)");
}
if (pkg.private === true) problems.push("private: true");
if (!pkg.pi || (!pkg.pi.extensions && !pkg.pi.skills && !pkg.pi.prompts && !pkg.pi.themes)) {
    problems.push("no pi manifest entries");
}
for (const [kind, patterns] of Object.entries(pkg.pi ?? {})) {
    for (const pattern of patterns) {
        const rel = pattern.replace(/^\.\//, "");
        if (!rel.includes("*") && !fs.existsSync(`${dir}/${rel}`)) {
            problems.push(`pi.${kind} points at a missing path: ${pattern}`);
        }
    }
}
if (!fs.existsSync(`${dir}/README.md`)) problems.push("no README.md");
if (!fs.existsSync(`${dir}/LICENSE`)) problems.push("no LICENSE");
if (problems.length) {
    console.error(problems.map((p) => `    \u2717 ${dir}: ${p}`).join("\n"));
    process.exit(1);
}
' "$dir"
}

npm_footer() {
    cat <<EOF

    gallery:  https://pi.dev/packages   (search: r2mopi)
    install:  pi install npm:<package-name>

EOF
}

# ------------------------------------------------------------------ the engine

# shellcheck source=../../tools/npm-registry/registry-common.sh
. "$SHARED_DIR/registry-common.sh"
# shellcheck source=../../tools/npm-registry/publish-engine.sh
. "$SHARED_DIR/publish-engine.sh"

# Pi packages for r2mo-lain

Each subdirectory here is an independent Pi package: its own `package.json`, its own
version, its own npm publish. Nothing is shared with the root `r2mo-ai` package.

## Layout

```text
plugins/pi/
├── README.md                       # this file
├── npm-login.sh                    # phase 1: entry point for the r2mopi-* packages
├── npm-publish.sh                  # phase 2: the r2mopi-* package set
└── <package-name>/                 # directory name == npm package name
    ├── package.json
    ├── extensions/
    ├── skills/
    ├── prompts/
    ├── themes/
    ├── README.md
    └── LICENSE
```

Both scripts are thin entry points: they describe this package set and then hand over to
the shared implementation in `tools/npm-registry/`, which the repository root uses too
(`./npm-login.sh` + `./npm-publish.sh`, for the package `r2mo-ai`).

## Conventions

- **Directory name = npm package name.** Nested scope folders are not used.
- **Family prefix `r2mopi-`** for every package published from here
  (`r2mopi-markdownrender`, `r2mopi-mxtskills`, …). Unscoped names need no npm org.
- **`keywords` must contain `pi-package`** and `package.json` must carry a `pi`
  manifest — that combination is what the Pi package gallery
  (<https://pi.dev/packages>) indexes. Without the keyword an npm publish never shows up
  there.
- **Pi peers stay unbundled**: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`,
  `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` and `typebox` belong in
  `peerDependencies` with a `"*"` range. Pi supplies them.
- **Publishing lives one level up**: `npm-login.sh` and `npm-publish.sh` in this directory
  own the release for the whole family, take no arguments, and always target
  `https://registry.npmjs.org/`. Forcing the hostname is not enough on a network that
  intercepts it — there the global npm config's npmmirror is what answers — so both scripts
  send that hostname through the public-DNS tunnel and reach the official registry. A
  package directory has no publish script of its own.

## Local testing

```bash
pi -e ./plugins/pi/<package-name>              # one-off, does not touch settings
pi install ./plugins/pi/<package-name>         # persistent, loads from the path
```

## Where a package applies

Pi reads one config directory — `~/.pi/agent` by default, or `PI_CODING_AGENT_DIR` when that
is set — so an installed package applies to every launcher that runs that same `pi`. A wrapper
such as `ft-cli` therefore gets the theme and the extension as well: it changes neither `HOME`
nor `PI_*`, passes no theme flag, and execs the `pi` found on `PATH`. Only `HH_CLI_PI_BIN`
(that wrapper's pi override) or `PI_CODING_AGENT_DIR` points at a different install or config
directory.

The bundled theme is selected once through `/settings` → **Theme** (Pi has no `/theme`
command) and saved as the `theme` setting. Switch that setting back to `dark` before
`pi remove`: otherwise every startup reports `Theme not found` and falls back to dark.

## Nested packages and git sources

Pi treats a git source (`pi install git:host/org/repo@ref`) as *the repository root*, so
these nested packages are reachable through npm and local paths only. Anyone wanting to
install from git would need a `pi` manifest at the repository root — deliberately not
done, to keep the CLI package `r2mo-ai` free of Pi-specific manifest entries.

## Versioning

**Every package carries the same version.** The family starts at `0.1.0` and moves
forward together: one bump writes the same new version into every `package.json`, so a
release is never half-shipped. Adding a package later is enough — the next run pulls it
onto the shared version automatically.

Never edit a `version` field by hand and never run `npm version` inside a package
directory: that creates drift, and every script here refuses to publish a drifted family.

## Publishing — two scripts, no arguments

Releasing is split into the two steps that fail for different reasons: authentication,
then versions and publishing. Both run with no arguments at all, and an argument is
refused instead of being treated as a mode.

```bash
cd plugins/pi
./npm-login.sh     # 1) log in (skipped when already logged in) and verify
./npm-publish.sh   # 2) sync every package to one version, then publish them
```

`npm-publish.sh` runs `npm-login.sh` itself **before** it writes anything, so a failed
login leaves the working tree and the registry untouched. Which version goes out follows
from the registry: a shared version that is **not on the registry yet** is published as
it stands (that is the first release, `0.1.0`), and once one is out, every run bumps the
patch. It then writes that version into every package, asks for one confirmation and
publishes. Publishing this set does **not** touch git: these packages ship on their own, and
when the release should also be committed, it is committed with the root package
(`./npm-publish.sh` one level up).

The browser step is always yours: the scripts open nothing and click nothing. npm prints
the login URL, the one-time-password prompt or the 2FA URL and waits for you, and the
result is verified afterwards.

Publishing this set does **not** touch git: these packages ship on their own, and the
release commit is the one the root package makes (`./npm-publish.sh` one level up).

Version bumps belong to the family script only, so a package directory has no publish
script of its own.

## Registry access on locked-down networks

Some networks answer for `registry.npmjs.org` with an internal npm mirror. That mirror
even serves its own `/-/v1/login` URL, so `npm login` opens a mirror page instead of
npmjs, and a publish would silently go to the mirror.

Both scripts detect this and fix it themselves, without `/etc/hosts` and without sudo: a
local proxy in `tools/npm-registry/public-registry-proxy.js` (shared with the root pair)
resolves the registry hostname through public DNS and tunnels only that hostname there.
The request, the hostname and the TLS certificate stay unchanged, and nothing has to be
forced: the tunnel is switched on by the detection itself.

Before any login starts, the scripts also ask the registry which login page it would hand
to a browser. When that page belongs to a mirror, the run stops — a token from an
npmmirror session is useless against npmjs, and npm would store it over a working one.

A token is welcome instead of the browser flow, but only for a run without a terminal: an
interactive `./npm-login.sh` never reads `$NPM_TOKEN`, so an exported variable cannot
shadow the login page. The token goes to a temporary file with mode 600 (`--userconfig`),
never into your npm config, and a rejected token aborts before anything is written.

Both scripts force `--registry=https://registry.npmjs.org/`, so a mirrored registry in the
global npm config can never receive a publish. A package whose version already exists on
the registry is skipped, so an interrupted release resumes by running the same command
again.

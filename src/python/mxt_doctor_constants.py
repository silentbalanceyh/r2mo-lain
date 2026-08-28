"""
mxt_doctor_constants.py - Constants for mxt doctor.
All glob patterns, regexes, exclusion lists. No project-specific strings.
"""

# ── noise directory prefixes ─────────────────────────────────────────
# Directories that should never appear in any doctor baseline.
# Doctor checks source-level resources only: pre-compile config, source,
# env, deploy scripts. IDE state, task management, knowledge-base, build
# artifacts, and doctor-internal files are always excluded.
#
# Two categories:
# 1. Hidden dot-directories (any path segment starting with '.') — covers
#    .claude/, .codex/, .cursor/, .vscode/, .idea/, .obsidian/,
#    .r2mo/, .github/, .hbuilderx/, .kube/, .opencode/, .trae/, .omx/,
#    .plan/, .vite/, .chglog/, .omc/, etc.
# 2. Build artifact directories — covers dist/, target/, node_modules/,
#    build/, out/, .next/, .nuxt/, .gradle/, .mvn/, .svelte-kit/
#
# NOTE: .env and .env.* files are NOT directories — they are env files
# and must NOT be excluded. The dot-dir filter only applies to path
# segments (directory names), not to filenames like .env.
NOISE_DIR_PREFIXES = (
    # Hidden dot-directories (IDE state, task mgmt, knowledge-base, etc.)
    '.omc/', '.omx/',
    '.r2mo/',          # catches .r2mo/.obsidian/, .r2mo/task/, .r2mo/out/, etc.
    '.obsidian/',
    '.vscode/', '.idea/', '.cursor/', '.claude/', '.codex/',
    '.github/', '.gitlab/', '.trae/',
    '.hbuilderx/', '.kube/', '.opencode/', '.plan/',
    '.vite/', '.chglog/', '.svelte-kit/',
    '.next/', '.nuxt/', '.gradle/', '.mvn/',
)

# Build artifact and third-party resource directory names — checked at any path depth
# These are compiled output, vendored dependencies, or bundled third-party
# resources (e.g., PDF.js viewer locale files) — not source-level files.
# NOTE: do NOT add 'resources', 'public', or 'static' here — those names
# are used for legitimate source-level config in Java/Node projects
# (e.g., src/main/resources/env.properties is a real env file).
BUILD_ARTIFACT_DIRS = (
    'node_modules', 'dist', 'target', 'build', 'out',
    '__pycache__', '.pytest_cache', '.mypy_cache',
    'vendor',         # Go/PHP vendored deps
    'Pods',           # iOS CocoaPods
    'locale',         # i18n locale bundles (PDF.js viewer, etc.)
    'hybrid',         # Cordova/Capacitor hybrid web resources (bundled, not source)
)

# ── project-type-specific source directory patterns ──────────────────
# Directories that are SOURCE-LEVEL for a specific project type.
# These are kept in baselines even if they might look like build artifacts.
# Format: { project_type: (path_patterns, ...) }
# Path patterns are matched as path segments (e.g., 'src/main/resources'
# matches any path containing these consecutive segments).
PROJECT_SOURCE_DIRS = {
    'java': (
        'src/main/resources',
        'src/test/resources',
    ),
    'go': (
        'configs', 'config', 'etc', 'internal',
        'deploy', 'initial', 'migrations',
    ),
    'rust': (
        'src-tauri', 'assets', 'plugins',
    ),
    'harmony': (
        'AppScope', 'entry/src/main', 'entry/src/ohosTest',
    ),
    'frontend': (
        'src', 'public', 'scripts', 'docker',
    ),
    'python': (
        'home', 'web', 'scripts', 'tools',
    ),
}

# ── project-type-specific noise directory patterns ───────────────────
# Directories that are NOISE for a specific project type but might not
# be caught by the universal NOISE_DIR_PREFIXES or BUILD_ARTIFACT_DIRS.
# Format: { project_type: (dir_names, ...) }
# These are checked as path segments at any depth.
PROJECT_NOISE_DIRS = {
    'java': (
        'META-INF',          # Generated SPI descriptors
        'swagger-ui',        # Bundled Swagger UI assets
        'templates',         # Template engine files (ftl, html) — not config
    ),
    'go': (
        'doctor',            # Old doctor config dirs (pre-mxt)
    ),
    'rust': (
        'gen',               # Generated Tauri code
    ),
    'harmony': (
        'oh_modules',       # HarmonyOS package cache (like node_modules)
        'hvigor',           # Build tool config
    ),
    'frontend': (
        'uni_modules',       # UniApp plugin marketplace (vendored)
        '.husky',            # Git hooks (tooling, not source)
    ),
}

# Hidden dot-file names that are NOT env files and should be excluded
# from file-list/file-hash (these are IDE/git system files)
# Hidden dot-file names that are NOT env files and should be excluded
# from file-list/file-hash (these are OS/IDE noise, not project config)
# NOTE: .gitignore, .dockerignore, .editorconfig, .prettierrc, .eslintrc*
# .npmrc, .yarnrc, .babelrc, .postcssrc are project-level config files
# and are NOT noise — they are tracked in file-list and file-hash.
NOISE_DOT_FILES = (
    '.DS_Store', '.gitattributes',
    '.envrc', '.nvmrc', '.node-version', '.tool-versions',
    '.prettierignore', '.eslintignore', '.npmignore',
)

# env file discovery globs
ENV_GLOBS = (
    '.env*',            # .env, .env.example, .env.production, .env.development, etc.
    '*.env',            # cloud.env, release.env, etc.
    '*.env.*',          # cloud.env.example, user.env.example, app.env.template, etc.
    '*secrets*env*',    # .secrets.env, .secrets.env.example (doesn't start with .env)
    '*.properties',     # env.properties, env-test.properties (filtered below)
)

# env line parser: covers dotenv, shell export, and properties formats
ENV_LINE_RE = r'^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$'

# dependency manifest filenames
DEP_MANIFESTS = (
    'package.json',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'pyproject.toml',
    'build.gradle',
)

# config file globs for content-hash
CONFIG_HASH_GLOBS = (
    '*.tf', '*.yaml', '*.yml', '*.json', '*.toml',
    '*.conf', '*.ini', '*.cfg',
    'Dockerfile*', 'docker-compose*',
    '*nginx*', 'vite.config.*',
    'tsconfig*.json', 'Makefile*',
    '*.properties',
    'deploy-*.sh',
    '*.json5',
    'manifest.json', 'pages.json',
    'tauri.conf.json', 'Trunk.toml',
    'build.gradle', 'build-profile.json5',
    'oh-package.json5', 'app.json5',
    # Edge-case config files — content-locked (these are the most drift-sensitive)
    # Git / Docker / Editor
    '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig',
    # Prettier — all format variants
    '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
    '.prettierrc.json5', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs',
    '.prettierrc.ts', 'prettier.config.js', 'prettier.config.cjs',
    'prettier.config.mjs', 'prettier.config.ts',
    # ESLint — legacy (.eslintrc*) and flat (eslint.config.*)
    '.eslintrc', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
    '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
    'eslint.config.js', 'eslint.config.cjs', 'eslint.config.mjs',
    'eslint.config.ts', 'eslint.config.mts',
    # Babel
    '.babelrc', '.babelrc.json', '.babelrc.js', '.babelrc.cjs', '.babelrc.mjs',
    'babel.config.js', 'babel.config.cjs', 'babel.config.mjs', 'babel.config.json',
    # PostCSS
    '.postcssrc', '.postcssrc.json', '.postcssrc.js', '.postcssrc.cjs',
    'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
    'postcss.config.json',
    # Tailwind
    'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs',
    'tailwind.config.ts', 'tailwind.config.json',
    # Package manager config
    '.npmrc', '.yarnrc', '.yarnrc.yml', '.pnpmrc',
    # Vite / webpack / rollup
    'webpack.config.*', 'rollup.config.*',
    # Vitest / Jest
    'vitest.config.*', 'vitest.workspace.*', 'jest.config.*',
    # Stylelint
    '.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs',
    'stylelint.config.js', 'stylelint.config.cjs',
)

# exclusion globs for content-hash
CONFIG_HASH_EXCLUDES = (
    'package-lock.json', 'go.sum', 'yarn.lock', 'pnpm-lock.yaml',
    '*.min.js', '*.min.css', '*.map',
    'dist/*', 'build/*', 'node_modules/*',
    # Dep manifests are tracked in meta-deps, not file-hash
    'package.json', 'go.mod', 'Cargo.toml', 'pom.xml', 'pyproject.toml', 'build.gradle',
)

# SQL file glob
SQL_GLOB = '*.sql'
INSERT_RE = r'INSERT\s+INTO'

# ── profile-specific file-list scope ─────────────────────────────────
# LOC profile: local dev chain (dev-*.sh, loc-*.sh, dev/, run-*.sh, *.env, Dockerfile)
LOC_FILE_GLOBS = (
    'dev-*.sh', 'loc-*.sh', 'run-*.sh', 'dev-start.sh', 'dev-stop.sh',
    'start-*.sh', 'stop-*.sh', '*.env', '.env*', '*.properties',
    'Dockerfile*', 'docker-compose*', 'Makefile*',
    '*.yaml', '*.yml', '*.toml', '*.conf', '*.ini', '*.cfg',
    'go.mod', 'package.json', 'Cargo.toml', 'pom.xml', 'pyproject.toml',
    'build.gradle',
    'vite.config.*', 'tsconfig*.json',
    'manifest.json', 'pages.json',
    'tauri.conf.json', 'Trunk.toml',
    '*.json5', 'oh-package.json5', 'app.json5',
    # Edge-case config files (anti-drift: AI must not silently change these)
    # Git / Docker / Editor
    '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig',
    # Prettier — all format variants
    '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
    '.prettierrc.json5', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs',
    '.prettierrc.ts', 'prettier.config.js', 'prettier.config.cjs',
    'prettier.config.mjs', 'prettier.config.ts',
    # ESLint — legacy (.eslintrc*) and flat (eslint.config.*)
    '.eslintrc', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
    '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
    'eslint.config.js', 'eslint.config.cjs', 'eslint.config.mjs',
    'eslint.config.ts', 'eslint.config.mts',
    # Babel
    '.babelrc', '.babelrc.json', '.babelrc.js', '.babelrc.cjs', '.babelrc.mjs',
    'babel.config.js', 'babel.config.cjs', 'babel.config.mjs', 'babel.config.json',
    # PostCSS
    '.postcssrc', '.postcssrc.json', '.postcssrc.js', '.postcssrc.cjs',
    'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
    'postcss.config.json',
    # Tailwind
    'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs',
    'tailwind.config.ts', 'tailwind.config.json',
    # Package manager config
    '.npmrc', '.yarnrc', '.yarnrc.yml', '.pnpmrc',
    # TypeScript project refs
    'tsconfig*.json',
    # Vite / webpack / rollup
    'vite.config.*', 'webpack.config.*', 'rollup.config.*',
    # Vitest / Jest
    'vitest.config.*', 'vitest.workspace.*', 'jest.config.*',
    # Stylelint
    '.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs',
    'stylelint.config.js', 'stylelint.config.cjs',
)
LOC_FILE_DIR_PREFIXES = ('dev/', 'etc/', 'config/', 'configs/', 'initial/', 'migrations/')

# K8S profile: deploy chain (deploy-k8s.sh, deploy/*, *.tf, *.sql, *.env, Dockerfile)
K8S_FILE_GLOBS = (
    'deploy-k8s.sh', 'deploy-k8s-verify.sh', 'deploy-k8s-verifyapi*',
    'deploy-*.sh', 'deploy-data-verify*.sh',
    '*.tf', '*.env', '.env*', '*.properties', '*.sql',
    'Dockerfile*', 'docker-compose*',
    '*.yaml', '*.yml', '*.toml', '*.conf', '*.ini', '*.cfg',
    'go.mod', 'package.json', 'Cargo.toml', 'pom.xml', 'pyproject.toml',
    'build.gradle',
    'vite.config.*', 'tsconfig*.json',
    'manifest.json', 'pages.json',
    'tauri.conf.json', 'Trunk.toml',
    '*.json5', 'oh-package.json5', 'app.json5',
    # Edge-case config files (anti-drift: AI must not silently change these)
    # Git / Docker / Editor
    '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig',
    # Prettier — all format variants
    '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
    '.prettierrc.json5', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs',
    '.prettierrc.ts', 'prettier.config.js', 'prettier.config.cjs',
    'prettier.config.mjs', 'prettier.config.ts',
    # ESLint — legacy (.eslintrc*) and flat (eslint.config.*)
    '.eslintrc', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
    '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs',
    'eslint.config.js', 'eslint.config.cjs', 'eslint.config.mjs',
    'eslint.config.ts', 'eslint.config.mts',
    # Babel
    '.babelrc', '.babelrc.json', '.babelrc.js', '.babelrc.cjs', '.babelrc.mjs',
    'babel.config.js', 'babel.config.cjs', 'babel.config.mjs', 'babel.config.json',
    # PostCSS
    '.postcssrc', '.postcssrc.json', '.postcssrc.js', '.postcssrc.cjs',
    'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
    'postcss.config.json',
    # Tailwind
    'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs',
    'tailwind.config.ts', 'tailwind.config.json',
    # Package manager config
    '.npmrc', '.yarnrc', '.yarnrc.yml', '.pnpmrc',
    # TypeScript project refs
    'tsconfig*.json',
    # Vite / webpack / rollup
    'vite.config.*', 'webpack.config.*', 'rollup.config.*',
    # Vitest / Jest
    'vitest.config.*', 'vitest.workspace.*', 'jest.config.*',
    # Stylelint
    '.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs',
    'stylelint.config.js', 'stylelint.config.cjs',
)
K8S_FILE_DIR_PREFIXES = (
    'deploy/', 'deploy/release/', 'deploy/terraform/',
    'initial/', 'migrations/', 'etc/', 'config/', 'configs/',
)

# ── mobile profile: local dev + mobile-specific config files ──────
MOB_FILE_GLOBS = LOC_FILE_GLOBS + (
    'App.vue', 'main.js', 'uni.scss',
    'agconnect-services.json', 'androidPrivacy.json',
)
MOB_FILE_DIR_PREFIXES = LOC_FILE_DIR_PREFIXES + ('entry/', 'AppScope/')

# ── desktop (win) profile: local dev + desktop-specific config files ──
WIN_FILE_GLOBS = LOC_FILE_GLOBS + (
    'Trunk.toml', 'tauri.conf.json',
)
WIN_FILE_DIR_PREFIXES = LOC_FILE_DIR_PREFIXES + ('src-tauri/', 'web/')

# ── profile dimension visibility ────────────────────────────────────
# Which dimensions are active for each profile.
# loc: file-list, file-hash, file-oob, meta-env, meta-deps, meta-ports,
#      meta-tokens, code-interfaces  (NO code-idempotency)
# k8s: all 9 dimensions including code-idempotency
LOC_DIMENSIONS = (
    'file-list', 'file-hash', 'file-oob', 'meta-env', 'meta-deps',
    'meta-ports', 'meta-tokens', 'code-interfaces',
)
K8S_DIMENSIONS = (
    'file-list', 'file-hash', 'file-oob', 'meta-env', 'meta-deps',
    'meta-ports', 'meta-tokens', 'code-interfaces', 'code-idempotency',
)

# ── mobile / desktop profile dimensions ──────────────────────────
# mob (mobile): like loc but adds mobile-specific config file checks
# win (desktop): like loc but adds desktop-specific config file checks
MOB_DIMENSIONS = LOC_DIMENSIONS  # inherits all loc dimensions including new ones
WIN_DIMENSIONS = LOC_DIMENSIONS  # inherits all loc dimensions including new ones

# Known profile registry (for validation / listing)
KNOWN_PROFILES = ('k8s', 'loc', 'mob', 'win')

# ── profile-specific forbidden patterns (written to file-list.conf as ! lines) ──
# K8S: .r2mo kubeconfig leak check
K8S_FORBIDDEN_PATTERNS = (
    '!deploy/release/*kubeconfig',
)

# LOC: no forbidden patterns by default
LOC_FORBIDDEN_PATTERNS = ()

# port extraction patterns
PORT_ENV_RE = r'^\w*PORT\w*=\s*(\d+)'
PORT_DOCKERFILE_RE = r'^EXPOSE\s+(\d+)'
PORT_YAML_RE = r'(?:^|\s)port[s]?:\s*"?(\d+)'
PORT_TF_RE = r'(?:container_port|port)\s*=\s*(\d+)'
PORT_NGINX_RE = r'listen\s+(\d+)'
PORT_PROXY_RE = r'proxy_pass\s+https?://[^:]+:(\d+)'
PORT_VITE_RE = r'port:\s*(\d+)'

# token name keywords (for selecting env vars to pattern-check)
TOKEN_KEYWORDS = (
    'SECRET', 'TOKEN', 'KEY', 'PASSWORD', 'PASS', 'AUTHTOKEN',
)

# token pattern classification thresholds
HEX_MIN_LENGTH = 32
PREFIX_HEX_RE = r'^([a-z]+-[a-z]+-)([0-9a-f]{32,})$'
HEX_RE = r'^[0-9a-f]{32,}$'
SK_PREFIX_RE = r'^sk-[A-Za-z0-9]+$'
PLACEHOLDER_RE = r'^CHANGE_ME'
ENV_REF_RE = r'^os\.environ/'

# interface extraction
GO_STRUCT_RE = r'type\s+(\w+)\s+struct\s*\{'
GO_JSON_TAG_RE = r'json:"([^"]+)"'
TS_INTERFACE_RE = r'interface\s+(\w+)\s*\{'
TS_TYPE_RE = r'type\s+(\w+)\s*='
OPENAPI_MARKER_RE = r'^(?:openapi|swagger):\s*'

# idempotency patterns (K8S profile)
BARE_CREATE_TABLE_RE = r'CREATE\s+TABLE\s+(?!.*IF\s+NOT\s+EXISTS)'
INSERT_WITHOUT_GUARD_RE = r'INSERT\s+INTO'
ON_CONFLICT_RE = r'ON\s+CONFLICT'
WHERE_NOT_EXISTS_RE = r'WHERE\s+NOT\s+EXISTS'
KUBECTL_DELETE_RE = r'kubectl\s+.*delete\s+(?!rs\b)'
TF_RESOURCE_RE = r'resource\s+"(kubernetes_\w+)"'
TF_LIFECYCLE_RE = r'lifecycle\s*\{'
TF_IGNORE_CHANGES_RE = r'ignore_changes'
DEPLOY_SCRIPT_RE = r'^deploy-.*\.sh$'
# verify scripts: deploy-data-verify*.sh in deploy/ directory
VERIFY_SCRIPT_RE = r'^deploy-data-verify.*\.sh$'
# less-than comparisons are invalid for post-deploy verify (data may have grown)
# only -lt and -le are violations; = and >= are both valid
VERIFY_LT_RE = r'\[\s*"\$.*"\s+-le?\s+\d+\s*\]'
# valid comparisons: = (exact) and >= / > (elastic)
VERIFY_EQ_RE = r'\[\s*"\$.*"\s+=\s*"\d+"\s*\]|\[\s*"\$.*"\s+-eq\s+\d+\s*\]'
VERIFY_GE_RE = r'\[\s*"\$.*"\s+-g[et]\s+\d+\s*\]'

# config file field counts (config_name, expected_tab_fields)
CONFIG_FIELD_COUNTS = {
    'file-list': 1,
    'file-hash': 2,
    'file-oob': 1,
    'meta-env': 1,
    'meta-deps': 3,
    'meta-ports': 3,
    'meta-tokens': 6,
    'code-interfaces': 4,
    'code-idempotency': 3,
}

# all config file names in prefix order
ALL_CONFIG_FILES = (
    'file-list.conf',
    'file-hash.conf',
    'file-oob.conf',
    'meta-env.conf',
    'meta-deps.conf',
    'meta-ports.conf',
    'meta-tokens.conf',
    'code-interfaces.conf',
    'code-idempotency.conf',
)

# config.json template
CONFIG_JSON_TEMPLATE = {
    'default_profile': 'k8s',
    'project_type': 'auto',
    'language': 'auto',
    'expected_branch': '',  # auto-detected on first --generate
    'env_sources': [],
}

# ── extended idempotency patterns ────────────────────────────────────
# terraform apply with plan-file
TF_APPLY_PLAN_RE = r'terraform\s+apply\s+.*-auto-approve|terraform\s+apply\s+.*plan'
TF_PLAN_FILE_RE = r'terraform\s+plan\s+.*-out\s*='
# terraform import (adopt existing resources)
TF_IMPORT_RE = r'terraform\s+import'
# kubectl apply (secret upsert)
KUBECTL_APPLY_RE = r'kubectl\s+apply\s+.*-f\s+'
KUBECTL_DRY_RUN_RE = r'--dry-run(?:=client|server)?'
# kubectl rollout restart
ROLLOUT_RESTART_RE = r'kubectl\s+.*rollout\s+restart'
# StatefulSet standalone PVC
STS_PVC_RE = r'volumeClaimTemplates'
# deploy-k8s.sh sub-script references (source/bash)
SOURCE_REF_RE = r'^\s*(?:source|bash|\.)\s+(.+?\.sh)'
# deploy-k8s.sh deploy order: DDL -> data -> security
DEPLOY_DDL_RE = r'deploy-ddl\.sh'
DEPLOY_DATA_RE = r'deploy-data\.sh'
DEPLOY_SECURITY_RE = r'deploy-security-data\.sh'

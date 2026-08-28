# mxt doctor

## 用途

防漂移扫描：检测项目配置漂移，生成基线或出报告。

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-g` / `--generate` | 生成基线配置到 `.r2mo/doctor/<profile>/` | boolean |
| `-p` / `--profile` | profile (loc/k8s/mob/win) | string |
| `-K` / `--genk8s` | 快捷: `--generate --profile k8s` | boolean |
| `-L` / `--genloc` | 快捷: `--generate --profile loc` | boolean |
| `-M` / `--genmob` | 快捷: `--generate --profile mob` | boolean |
| `-W` / `--genwin` | 快捷: `--generate --profile win` | boolean |

## 说明

- **三大职责闭环**：
  1. `mxt doctor --gen<profile>` — 分析项目无错方式生成元数据配置到 `.r2mo/doctor/<profile>/`
  2. `$mxt-doctor` 技能 — 启动 LLM 补齐和矫正 `.r2mo/doctor/` 中的元数据（详见 [mxt-doctor](../skills/mxt-doctor.md)）
  3. `mxt doctor --profile <profile>` — 执行最终漂移验证，保证前两步结果一致性
- **profile 说明**：
  - `loc` — 本地开发环境，检查源码、配置、环境变量、依赖版本
  - `k8s` — K8S 部署环境，在 loc 基础上追加部署链路检查（terraform、deploy 脚本幂等性等）
  - `mob` — 移动应用，在 loc 基础上追加 `manifest.json`、`pages.json` 等
  - `win` — 桌面应用，在 loc 基础上追加 `tauri.conf.json`、`Trunk.toml` 等
- **9 个检查维度**：file-list、file-hash、file-oob、meta-env、meta-deps、meta-tokens、meta-ports、code-interfaces、code-idempotency
- **生态标签**：依赖版本检查按生态分组打印 `[go]`/`[npm]`/`[cargo]`/`[maven]`/`[gradle]`/`[python]`
- **边角配置文件**：`.gitignore`、`.dockerignore`、`.npmrc`、`.eslintrc`、`tsconfig*.json` 等在 `--gen???` 时自动写入 `file-hash.conf` 并做内容锁定（sha256）
- **子项目委托**：当项目含 `.gitmodules` 时，父项目自动跳过子模块路径，子项目独立扫描
- **噪声过滤**：`.claude/`、`.r2mo/`、`.obsidian/`、`node_modules/`、`dist/`、`target/` 等隐藏目录和构建产物自动排除
- **报告输出**：扫描结果写入 `.r2mo/verify/doctor/<timestamp>/<project>-<profile>.md`
- 可先运行 `mxt help -c doctor` 查看 CLI 内置帮助。

## 命令执行记录

以 `app-r2mo/r2mo-apps-admin` 项目（Java/Maven + Rust/Tauri + Node/TS 混合生态）为示例：

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ PROJ="/Users/lang/zero-cloud/app-zero/r2mo-apps/app-r2mo/r2mo-apps-admin"
$ cd "$PROJ"
$ node "$REPO/src/mxt.js" doctor --genloc

── mxt doctor --generate --profile loc ──

Dimension Status:
  ✅ file-list.conf                   118 entries
  ✅ file-hash.conf                   124 entries
  ⊘  file-oob.conf                  SKIP — no SQL files with INSERT found
  ✅ meta-env.conf                     30 entries
  ✅ meta-deps.conf                    37 entries
  ✅ meta-ports.conf                    2 entries
  ✅ meta-tokens.conf                   3 entries
  ✅ code-interfaces.conf             414 entries
  ⊘  code-idempotency.conf          SKIP — no SQL/TF/deploy scripts found (no idempotency rules to check)

Total: 7/9 generated, 2/9 skipped, 0/9 failed

  📦 Dep ecosystems: cargo: 22, maven: 14, npm: 1

⚠️  2 dimension(s) skipped — review if these should have signals.
   Skipped dimensions mean the project does not have the corresponding
   file types. This is expected for some projects (e.g., frontend has no SQL).
   If a dimension should have signals, check file patterns in mxt_doctor_constants.py.

$ node "$REPO/src/mxt.js" doctor --profile loc

── branch ──
  ✅ PASS branch: master

── file-list ──
  ✅ PASS .gitignore (tracked, exists)
  ✅ PASS Makefile (tracked, exists)
  ✅ PASS deployment/ansible/ansible.cfg (tracked, exists)
  ✅ PASS deployment/ansible/playbooks/deploy-infra-docker.yml (tracked, exists)
  ... (118 entries, all PASS)

── file-hash ──
  ✅ PASS .gitignore (sha256: d8bfeaa45cb6...)
  ✅ PASS .mcp.json (sha256: 00181866324b...)
  ✅ PASS Makefile (sha256: eac769edb223...)
  ... (124 entries, all PASS)

── file-oob ──
  ⊘ SKIP file-oob.conf not found

── meta-env ──
  ⚠️  WARN R2MO_NACOS_API (extra in current env)
  ⚠️  WARN R2MO_REDIS_DATABASE (extra in current env)
  ⚠️  WARN R2MO_REDIS_HOST (extra in current env)
  ⚠️  WARN R2MO_REDIS_PORT (extra in current env)
  ⚠️  WARN Z_SIS_STORE (extra in current env)
  ✅ PASS R2MO_REMOTE_SSH_SCRIPT (injected, name exists)
  ✅ PASS R2MO_REMOTE_SSH_USER (injected, name exists)
  ✅ PASS R2MO_REMOTE_SSH_HOST (injected, name exists)

── meta-deps ──
  ✅ PASS [maven] r2mo-apps-admin-api/pom.xml:io.zerows.apps:r2mo-apps-admin-provider=${project.version}
  ✅ PASS [maven] r2mo-apps-admin-domain/pom.xml:io.zerows:zero-boot-cloud-actor=
  ... (14 maven entries, all PASS)
  ✅ PASS [cargo] r2mo-apps-admin-ui/Cargo.toml:base64=0.22.1
  ✅ PASS [cargo] r2mo-apps-admin-ui/Cargo.toml:leptos={ version = "0.8.19", features = ["csr"] }
  ✅ PASS [cargo] r2mo-apps-admin-ui/src-tauri/Cargo.toml:tauri={ version = "2.11.2", features = [] }
  ... (22 cargo entries, all PASS)
  ✅ PASS [npm] r2mo-apps-admin-ui/package.json:tailwindcss=^4.2.2

── meta-ports ──
  ✅ PASS r2mo-apps-admin-api/src/main/resources/env.properties:Z_API_PORT=6200
  ✅ PASS r2mo-apps-admin-api/src/main/resources/env.properties:Z_SOCK_PORT=6200

── meta-tokens ──
  ✅ PASS R2MO_NACOS_PASSWORD (mode=fixed)
  ✅ PASS R2MO_REDIS_PASSWORD (mode=fixed)
  ✅ PASS Z_DB_APP_PASS (mode=fixed)

── code-interfaces ──
  ✅ PASS BAuthority (openapi) (content-locked, hash: 01eeb13be5ef...)
  ✅ PASS ECompany (openapi) (content-locked, hash: f1bcc4c8d1ac...)
  ... (414 openapi entries, all PASS)

── code-idempotency ──
  ⊘ SKIP code-idempotency.conf not found

Report: .r2mo/verify/doctor/20260828-2225/r2mo-apps-admin-loc.md

  PASS=426  FAIL=0  WARN=5  SKIP=2
```

WARN 说明：`meta-env` 中的 5 个 WARN 是环境变量新增告警（`extra in current env`），表示项目当前环境变量文件中出现了基线中未记录的变量，需重新执行 `--genloc` 来捕获。

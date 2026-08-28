# $mxt-doctor / /mxt:doctor

## 基本介绍

`mxt-doctor` 是 `mxt ai-cmd` 安装到 AI 工具中的防漂移矫正 Skill。Codex 中以 `$mxt-doctor` 调用；Claude Code / OpenCode 中对应 `/mxt:doctor`。

## 用途

智能矫正 `.r2mo/doctor/<profile>/` 中的元数据，使其与项目实际特征对齐。该技能**不是被动审查者**，而是主动修复配置文件。

### 核心问题

`mxt doctor --gen???` 使用固定 glob 和正则匹配，不同项目结构差异大，脚本无法自主判断：

- `.env.production` 在项目 X 中是固定值（需值检查），在项目 Y 中是占位符
- `config.yaml` 在项目 X 中是主配置（应进 file-hash），在项目 Y 中是生成物（应排除）
- `Z_DB_PASSWORD=""` 在一个文件中为空意味着运行时注入

LLM 可以读取项目、理解意图，并**直接编辑 `.r2mo/doctor/<profile>/*.conf` 文件**来修正这些问题。

### 防漂移核心原则

- **锁定的（配置级、编译前）**：环境变量名和值、依赖版本、端口分配、Token/Secret 模式、配置文件内容哈希、文件结构（存在 + git-tracked）、接口契约哈希、部署脚本幂等规则、SQL 种子文件存在性
- **不锁定的（源码级、自由演进）**：API 路由定义、SQL Schema 列/类型、Dockerfile 基础镜像内容（由 file-hash 覆盖但不单独追踪）、函数实现、业务逻辑

## 适用场景

- `mxt doctor --gen???` 生成基线后，需要 LLM 校正分类错误和冗余
- 项目结构变更后需要重新对齐 `.r2mo/doctor/` 配置
- 多 profile（loc/k8s/mob/win）之间的配置一致性检查

## 输入

- 可选 profile 名称：`k8s`、`loc`、`mob`、`win`（省略则处理所有 profile）
- `Deep` — 深入交叉验证（更慢但更精确）
- `Dry` — 只分析报告，不修改 `.conf` 文件

## 闭环流程

该技能是三大职责闭环的第二环：

1. **生成**：`mxt doctor --gen<profile>` — 脚本自动生成基线
2. **矫正**：`$mxt-doctor` / `/mxt:doctor` — LLM 分析项目特征并修正 `.conf` 文件
3. **验证**：`mxt doctor --profile <profile>` — 执行最终漂移检查

三步全通过才算闭环。

## 工作流

1. **项目分析**：`git ls-files`、项目类型识别、环境变量约定、配置文件约定、部署链路识别
2. **生成与扫描**：保存已提交基线，执行 `mxt doctor --gen<profile>` + `mxt doctor --profile <profile>`
3. **差异分析**：对比已提交基线与新生成结果，分类差异（预期漂移 / 脚本缺口 / 分类错误 / 缺失信号 / 过期条目）
4. **智能矫正**：直接编辑 `.r2mo/doctor/<profile>/*.conf` 文件
5. **重扫验证**：再次执行 `mxt doctor --profile <profile>`，确认收敛（最多 3 轮迭代）
6. **输出报告**：矫正前后对比、修复项清单、收敛状态

## 9 个检查维度

| 维度 | 配置文件 | 检查内容 |
|:---|:---|:---|
| file-list | `file-list.conf` | 文件存在性 + git-tracked 状态 |
| file-hash | `file-hash.conf` | 文件内容哈希锁定（sha256） |
| file-oob | `file-oob.conf` | SQL 种子文件存在性（不锁内容） |
| meta-env | `meta-env.conf` | 环境变量名 + 值双端检查 |
| meta-deps | `meta-deps.conf` | 依赖版本漂移检测 |
| meta-tokens | `meta-tokens.conf` | Token/Secret 模式验证 |
| meta-ports | `meta-ports.conf` | 端口声明验证 |
| code-interfaces | `code-interfaces.conf` | 接口契约哈希锁定 |
| code-idempotency | `code-idempotency.conf` | 部署幂等规则（k8s profile） |

## 柔性锁定机制

所有维度支持两种模式，且模式覆盖在 `--generate` 重新生成时保留：

- **existence-only**：只检查文件/变量是否存在
- **content-locked**：同时检查内容（sha256 或 KEY=VALUE）

LLM 可以按需升级或降级单个条目的锁定模式，支持项目持续开发中的基线演进。

## 持续开发工作流

基线**不是冻结的**，而是随项目前进。锁定哲学是**防止漂移和意外变更，不是冻结演进**。

- 合法内容变更 → 重新 `--gen<profile>` 更新基线
- 新增文件 → 重新生成捕获
- 文件删除 → 重新生成移除条目
- 环境变量重命名 → 报告 FAIL + WARN，这正是系统要捕获的漂移

## 写回 / 输出

- `.r2mo/doctor/<profile>/*.conf` 文件（矫正后的基线配置）
- `.r2mo/doctor/config.json`（元数据）
- 标准化矫正报告（打印到终端）

## 注意事项

- 只修改 `.r2mo/doctor/` 中的元数据，不触碰源代码、部署脚本、env 文件
- 不执行 git commit/push
- 子模块委托：父项目含 `.gitmodules` 时自动跳过子模块路径，子项目独立扫描
- 噪声过滤：`.claude/`、`.r2mo/`、`.obsidian/`、`node_modules/`、`dist/`、`target/` 等自动排除

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-doctor/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/doctor.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/doctor.md`

## 命令执行记录

以 `app-r2mo/r2mo-apps-admin` 项目（Java/Maven + Rust/Tauri + Node/TS）为例，展示 `mxt doctor --genloc` + `mxt doctor --profile loc` 的完整闭环：

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ PROJ="/Users/lang/zero-cloud/app-zero/r2mo-apps/app-r2mo/r2mo-apps-admin"
$ cd "$PROJ"

# Step 1: 生成基线
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
  ⊘  code-idempotency.conf          SKIP — no SQL/TF/deploy scripts found

Total: 7/9 generated, 2/9 skipped, 0/9 failed
  📦 Dep ecosystems: cargo: 22, maven: 14, npm: 1

# Step 2: LLM 矫正（$mxt-doctor loc）
#   - 检查 .env.development / .env.production 的分类是否正确
#   - 检查 meta-deps 的生态标签是否覆盖全部 manifest
#   - 移除冗余条目、修正误分类

# Step 3: 最终漂移验证
$ node "$REPO/src/mxt.js" doctor --profile loc

── branch ──
  ✅ PASS branch: master

── meta-deps ──
  ✅ PASS [maven] r2mo-apps-admin-api/pom.xml:io.zerows.apps:r2mo-apps-admin-provider=${project.version}
  ... (14 maven entries)
  ✅ PASS [cargo] r2mo-apps-admin-ui/Cargo.toml:leptos={ version = "0.8.19", features = ["csr"] }
  ... (22 cargo entries)
  ✅ PASS [npm] r2mo-apps-admin-ui/package.json:tailwindcss=^4.2.2

── meta-env ──
  ⚠️  WARN R2MO_NACOS_API (extra in current env)
  ⚠️  WARN R2MO_REDIS_DATABASE (extra in current env)
  ⚠️  WARN R2MO_REDIS_HOST (extra in current env)
  ⚠️  WARN R2MO_REDIS_PORT (extra in current env)
  ⚠️  WARN Z_SIS_STORE (extra in current env)
  ✅ PASS R2MO_REMOTE_SSH_SCRIPT (injected, name exists)
  ✅ PASS R2MO_REMOTE_SSH_USER (injected, name exists)
  ✅ PASS R2MO_REMOTE_SSH_HOST (injected, name exists)

  PASS=426  FAIL=0  WARN=5  SKIP=2
```

5 个 WARN 表示环境变量文件中出现了基线未记录的新变量，需重新 `--genloc` 捕获后再次验证。

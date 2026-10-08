# Codex /m* 短命令

## 用途

Codex 端为同一套 MXT 工作流提供轻量斜杠命令名。用户少打字，Agent 读到的底层仍是同一批 MXT Skills；这些 Skills 继续执行统一的磁盘状态、锁路径、门禁、验收和写回规则。

本页只解释 Codex `/m*` 短命令这一层，不复述每个完整工作流的详细契约；工作流细节请转到下方对照表里的 Skill 文档。

## 命名与安装

`mxt ai-cmd` 从仓库 `agent/commands/codex/mxt/commands/<workflow>.md` 拷贝命令源。安装时统一改成 Codex-only 短文件名：

```text
<workflow>.md -> m<workflow>.md
```

因此暴露的命令是：

```text
/mplan    /mrun    /mend     /mgoon
/mdebug   /msync   /mstart   /mloop
/mdoctor  /mtask
```

短命令会随同一套 MXT Skills 写入：

- `~/.codex/plugins/mxt/commands/m*.md`
- `~/.codex/plugins/cache/mxt-skills/mxt/1.0.0/commands/m*.md`
- `~/.codex/marketplaces/mxt-skills/` 内的对应 plugin mirror
- `~/.codex/prompts/m*.md`

`$mxt-*` 是仍然保留的语义别名，例如 `$mxt-plan`、`$mxt-run`、`$mxt-task`。用户可以选择短斜杠或长语义形式；两者对应的工作流一致。

平台纪律：

- Claude Code / OpenCode：只安装和使用 `/mxt:<workflow>`；不安装任何 `/m*`。
- Pi Agent：只安装 `/mxt-<workflow>` 技能与同义短命令；不安装 Codex 的 `/m*`。
- Codex：同批安装 10 个 `/m*` 斜杠命令与 10 个 `$mxt-*` Skills。

MXT 始终保持 10 个工作流：`plan`、`run`、`end`、`goon`、`debug`、`sync`、`start`、`loop`、`doctor`、`task`。

## 命令对照

| Workflow | Codex 短命令 | 语义 Skill / 长别名 | 典型调用 | 用途 |
|:---|:---|:---|:---|:---|
| plan | `/mplan [NNN]` | `$mxt-plan` | `/mplan 001` | 读取任务体并写入可跟踪的执行计划。 |
| run | `/mrun [NNN] [Team\|Worktree]` | `$mxt-run` | `/mrun 001 WT` | 按任务或计划实施，跑门禁并追加 `## Changes`。 |
| end | `/mend [NNN] [Deep\|Strict]` | `$mxt-end` | `/mend 001` | 对任务变更做对抗式验收，只产出 P0/P1 整改项。 |
| goon | `/mgoon [NNN] [Team\|Worktree]` | `$mxt-goon` | `/mgoon 001` | 只处理 goon 文件中列出的整改项，并把闭环证据写回任务。 |
| debug | `/mdebug [description] [P0-P3] [Deep] [Worktree]` | `$mxt-debug` | `/mdebug login fails P1` | 诊断、修复并归档 `.r2mo/bugs/` 下的 Bug Report。 |
| sync | `/msync` | `$mxt-sync` | `/msync` | 收敛、拉取、提交、跑门禁、推送并刷新已安装镜像。 |
| start | `/mstart` | `$mxt-start` | `/mstart` | 固定后端优先启动，再启动前端，最后做健康验证。 |
| loop | `/mloop [NNN]` | `$mxt-loop` | `/mloop 001` | 在隔离 Dev / Review 会话间循环 RUN / END / GOON 直到清零。 |
| doctor | `/mdoctor [k8s\|loc\|mob\|win] [Deep] [Dry]` | `$mxt-doctor` | `/mdoctor loc Dry` | 分析 `.r2mo/doctor/` 基线并按 profile 修复防漂移配置。 |
| task | `/mtask <requirement>` | `$mxt-task` | `/mtask 把导出改成异步队列` | 将自然语言需求绑定为阈值之上的标准溢出任务并立即执行。 |

## 每个 /m 命令的专用文档

每个 Codex 短命令都对应一份独立的工作流文档，说明参数、锁路径、失败模式和下一步：

| Codex /m | 完整工作流文档 |
|:---|:---|
| `/mplan` | [mxt-plan](mxt-plan.md) |
| `/mrun` | [mxt-run](mxt-run.md) |
| `/mend` | [mxt-end](mxt-end.md) |
| `/mgoon` | [mxt-goon](mxt-goon.md) |
| `/mdebug` | [mxt-debug](mxt-debug.md) |
| `/msync` | [mxt-sync](mxt-sync.md) |
| `/mstart` | [mxt-start](mxt-start.md) |
| `/mloop` | [mxt-loop](mxt-loop.md) |
| `/mdoctor` | [mxt-doctor](mxt-doctor.md) |
| `/mtask` | [mxt-task](mxt-task.md) |


## 与 `mxt coder` 索引的关系

多数 MXT Skills 已加入同一提示：如果 `.r2mo/repo/self/` 已存在索引，可以在解读仓库结构时调用 `mxt coder locate`、`expand` 或 `status` 的投影；如果没有索引就正常继续，不做隐式重建。`mxt coder` 的扫描与更新仍由用户显式触发。

这样短的 `/m*` 命令只要当前仓有现成索引，就能更快定位相关实现，而不会在命令内部先扫全仓。

## 验证

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ cd "$REPO"
$ find agent/commands/codex/mxt/commands -maxdepth 1 -name '*.md' -print | sort
agent/commands/codex/mxt/commands/debug.md
agent/commands/codex/mxt/commands/doctor.md
agent/commands/codex/mxt/commands/end.md
agent/commands/codex/mxt/commands/goon.md
agent/commands/codex/mxt/commands/loop.md
agent/commands/codex/mxt/commands/plan.md
agent/commands/codex/mxt/commands/run.md
agent/commands/codex/mxt/commands/start.md
agent/commands/codex/mxt/commands/sync.md
agent/commands/codex/mxt/commands/task.md
$ echo $?
0
```

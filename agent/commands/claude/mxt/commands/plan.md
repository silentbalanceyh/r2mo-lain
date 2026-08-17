---
description: "Plan R2MO task by 3-digit number such as 001; write or update the Plan section in .r2mo/task/task-xxx.md."
argument-hint: "[001] [指令...]"
---

# /mxt:plan

## Harness

This Harness is the binding execution contract for this MXT command across Claude Code, Codex, and OpenCode. Treat localized sections below as legacy detail; this section wins when wording conflicts.

- English-first: write instructions, analysis, verification notes, and summaries in English by default. Use Chinese only when quoting existing repository content, preserving task titles/frontmatter/status values, showing exact localized command errors already required by this file, or when the user explicitly asks for Chinese.
- Rule loading: before task action, load repository entry rules (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`), project rule files (`.claude/rules`, `.codex/rules`, `.cursor/rules`, `.opencode`, other relevant `.mdc`), and `~/.codex/rules/r2mo-task-workflow.md` when present. Missing optional files do not block execution.
- Argument contract: resolve the explicit three-digit number first. If absent, list current-directory `.r2mo/task/` candidates only. Never resolve from parent, child, sibling, or historical timestamped task directories unless the user names that path.
- Task isolation lock: after resolving paths, print the locked path(s) before reading task content, and only read/write those locked `task-*.md`, `goon-*.md`, or `loop-*.json` files for this invocation.
- Disk source of truth: Do not trust conversation memory, previous summaries, installed plugin cache, or earlier reads. Re-read the locked files from disk immediately before decisions and again before write-back.
- Prompt echo: before editing, verification, or task execution, print the final action prompt in one Markdown code block with concrete paths substituted.
- Write-back guard: before any write, verify the destination exactly matches the isolation lock. Never duplicate `Plan` or `Changes`; update in place or append under the existing canonical section as instructed.
- Fresh evidence before completion claims: run the smallest sufficient verification for the changed boundary, read the output, and only then report success. Record skipped gates with the reason.
- Cross-agent portability: avoid tool-specific assumptions unless the platform section explicitly requires them. Keep prompts deterministic and safe for Claude Code, Codex skills, Codex prompts, and OpenCode JSON command templates.

读取当前工作目录下指定编号的 `.r2mo/task/task-xxx.md`，只生成执行计划，并写回该 task 文件的 `Plan` 章节。

The user invoked this command with: $ARGUMENTS

## 参数解析

1. `$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。
2. 编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
   - `Team` / `Team模式` — 标记后续 run 强制启用 Team 模式（plan 本身不启用）
   - `Worktree` / `WT` — 标记后续 run 强制使用 Worktree 隔离（plan 本身不启用）
   - `深度` / `Deep` — 启用深度分析模式，Plan 更详尽
3. 解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: Team模式, Worktree`。若未附加指令则仅声明编号。

**硬规则**：解析失败→终止 | Plan仅写`## Plan` | 路径冲突→终止 | 隔离外文件→禁止读写 | Superpowers直接调用（仅工具报不存在才降级）

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 解析 `$ARGUMENTS`：提取编号和执行指令。如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `task-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `task-*.md` 文件，提示用户先创建任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt:plan 001 [指令...] 格式执行，其中 001 是三位数字任务编号。`
3. 将任务路径设为 `.r2mo/task/task-$编号.md`。如果文件不存在，不要猜测其他编号，不要改读别的 task 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/task-$编号.md`，此后本指令的所有读操作和写操作只能针对此路径，禁止读写任何其他 `task-*.md` 文件。
5. 先读取锁定路径 frontmatter 之后的正文；如果正文为空或仅包含空白字符，立即停止并直接返回：锁定路径正文为空，当前不执行 /mxt:plan，请先补充任务内容。
6. **Superpowers 集成**：默认认定 superpowers 已安装并直接调用。不得依据"上下文是否出现 superpowers 横幅"或模型对 available-skills 的自省来判断是否可用——此类判断不可靠，已多次误报"未注册"导致错误降级为标准流程。
   - 通过 Skill 工具直接调用 `superpowers:brainstorming`，对任务进行头脑风暴分析，将分析结果作为 Plan 的输入。
   - 再通过 Skill 工具调用 `superpowers:writing-plans`，生成结构化 Plan。
   - **唯一降级判据**：仅当 Skill 工具返回明确的"技能不存在/未注册"错误时，才走手动分析并生成 Plan 的标准流程；调用成功则必须采纳其输出，不得跳过或自行降级。
   - 在聊天窗口声明路径：`📌 规划路径: Superpowers[brainstorming+writing-plans]`（已调用）或 `📌 规划路径: 标准流程`（仅因 Skill 工具报技能不存在而降级时方可声明）。
7. 在执行任何编辑或规划处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
8. 对该任务文件按以下提示词执行，其中任务路径必须替换为实际相对路径：

任务：为 `<TASK_PATH>` 生成执行计划。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回"任务正文为空，未生成 Plan"，且不修改任何文件。
- 写回位置：仅写回 `<TASK_PATH>` 的 `## Plan` 章节。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- 写回规则：若 `## Plan` 已存在，则原位更新；不得重复追加多个 Plan。
- Plan 要求：包含目标拆解、涉及文件/模块、执行步骤、验证方式、风险与交接说明。
- 边界约束：不执行实现，不修改 status，不追加 Changes，不创建或修改 goon 文件。
- 隔离约束：全程不得读取、编辑或创建除 `<TASK_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件。

## 闭环指引

Plan 完成后的典型路径：
- 下一步执行 → `/mxt:run <编号>`
- 如需团队协作 → `/mxt:run <编号> Team模式`
- 如需隔离执行 → `/mxt:run <编号> Worktree`
- 执行后验收 → `/mxt:end <编号>`

## Verification

完成后说明 `## Plan` 写回位置、是否更新已有 Plan，Superpowers 调用情况，以及未执行实现和未追加 Changes。

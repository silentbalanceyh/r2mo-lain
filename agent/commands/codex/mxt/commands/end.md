---
description: "Verify R2MO task by 3-digit number such as 001; write current remediation items to .r2mo/task/goon-xxx.md."
argument-hint: "[001] [指令...]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# /mxt-end

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

读取当前工作目录下指定编号的 `.r2mo/task/task-xxx.md`，验证任务是否完成，并写出对应 `.r2mo/task/goon-xxx.md` 当前待整改项。

## Arguments

The user invoked this command with: $ARGUMENTS

`$ARGUMENTS` 以三位数字编号开头，正则为 `^[0-9]{3}`，例如 `001`。编号之后的附加文本作为**执行指令**，以空格分隔，不区分大小写。支持的指令：
- `深度` / `Deep` — 启用深度验收，逐文件对比变更与任务要求
- `严格` / `Strict` — 严格模式，在当前任务验收边界内提高敏感度；仍只允许 P0/P1 整改项，不得升级 P2/P3/优化项

解析后在聊天窗口中声明结果，例如 `📌 编号: 005 | 指令: 深度`。若未附加指令则仅声明编号。

**硬规则**：解析失败→终止 | goon先清空再写 | 禁改task Changes | 路径冲突→终止 | 隔离外文件→禁止读写 | 收敛验收禁止深挖 | 验收仅核验Changes声明范围，不触碰非本次变更的脏文件 | Superpowers检测必执行（无则降级）

### 核心验收约束（不可被“深度/严格”覆盖）

1. 仓库规则与 MDC 是硬约束；如存在验证预算/禁止重复/增量验收规则，优先级高于本命令任何默认全量或追加式表述。
2. `/mxt-end` 是风险受控的任务验收，不是完美系统审计；不得以“每行代码、每个测试、所有历史问题必须完美”为关闭标准。
3. goon 只写 P0/P1：直接破坏当前任务验收、编译/运行，或让本次变更边界不可可靠使用的问题。
4. 禁止写入 P2/P3、优化建议、风格问题、猜测风险、无关旧债和“可以更好”的重构项。
5. 首次 end 必须在所选范围内一次性给齐当前阻断包；多个证据属于同一失败时合并为一个整改项并写清验收标准，禁止一轮两个、一轮几个的挤牙膏式追加。
6. goon 整改后的复验只核验已列 goon 项及整改引入的直接 P0/P1 阻断；不得重新全量扫描并制造新整改轮次。
7. 保持验收尺度一致：写失败事实 + 验收标准；除非唯一安全路径明确，不强制或反复切换 A/B 实现方案。
8. 验证采用最小受影响目标且一次绿色即固定；未经用户明确授权，不跑全量/工作区 gate，不重复已绿检查。
9. 若预算内证据不足，报告确切未验证范围；不要长时间空转思考或用低价值扫描拖延推进。
10. **收敛验收**：先对照任务正文、Plan、Changes 声明范围和最小受影响验证结果；禁止深挖任务外实现细节、历史债、全仓潜在风险、可能性推演或“顺手再看一下”的额外范围。
11. **不得扩散整改项**：发现 P0/P1 阻断后只写当前任务闭环必需项；不要沿着一个问题继续挖同类、相邻模块、风格优化或后续专题。
12. **到点停止**：完成一次任务边界内核验和必要最小验证后立即写结论；若证据不足，只记录未验证范围，不继续搜索新问题。

## Preflight

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 如果 `$ARGUMENTS` 为空，扫描当前工作目录 `.r2mo/task/` 下的 `task-*.md` 文件，读取每个文件的 frontmatter 中的 `title` 和 `status`，列出编号与标题供用户选择，用户选择后用对应编号继续执行；如果 `.r2mo/task/` 下没有 `task-*.md` 文件，提示用户先创建任务。如果 `$ARGUMENTS` 不为空但开头不匹配 `^[0-9]{3}`，立即停止，只提示：`请使用 /mxt-end 001 [指令...] 格式执行，其中 001 是三位数字任务编号。`
3. 将任务路径设为 `.r2mo/task/task-$编号.md`，将整改路径设为 `.r2mo/task/goon-$编号.md`。如果任务文件不存在，不要猜测其他编号，不要改读别的 task 文件，立即询问用户提供最新任务号。
4. **隔离锁定**：在聊天窗口中显式声明 `📌 任务隔离锁定: .r2mo/task/task-$编号.md | .r2mo/task/goon-$编号.md`，此后本指令的读写操作只能针对这两个路径，禁止读写任何其他 `task-*.md` 或 `goon-*.md` 文件。
5. 先读取 `<TASK_PATH>` frontmatter 之后的正文；如果正文为空或仅包含空白字符，立即停止并直接返回：`<TASK_PATH> 正文为空，当前不执行 /mxt-end，请先补充任务内容。`

## Plan

1. 读取任务正文、已有 Plan、已有 Changes 和当前代码状态。
2. **深度验收**：若参数解析中检测到 `深度` 指令，逐文件读取变更内容与任务要求比对；否则按标准粒度验收。
3. **严格模式**：若参数解析中检测到 `严格` 指令，在当前任务验收边界内提高敏感度；仍只列 P0/P1，不列 P2/P3/优化项。
4. 生成本轮待整改项列表。
5. 写入 goon 文件：写入前必须清空原始内容，再写入当前待整改项。

## Commands

1. 在执行任何编辑、验证或任务处理之前，先在聊天窗口中原样打印本次将执行的提示词，使用 Markdown 代码块包裹。代码块中只打印下面这段最终执行提示词，不要打印本条说明。
2. 对该任务文件按以下提示词执行，其中任务路径和整改路径必须替换为实际相对路径：

任务：验收 `<TASK_PATH>`，并生成 `<GOON_PATH>` 整改队列。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回"任务正文为空，未执行验收"，且不修改任何文件。
- 验收依据：对照任务正文、已有 Plan、已有 Changes 和当前代码状态判断任务是否完成。
- 核心约束：这是风险受控的任务验收，不是完美系统审计；仓库 MDC/验证预算优先，深度/严格也不能覆盖。
- 收敛验收：先对照任务正文、Plan、Changes 声明范围和最小受影响验证结果；禁止深挖任务外实现细节、历史债、全仓潜在风险、可能性推演或“顺手再看一下”的额外范围。
- 整改项门槛：只写直接破坏当前任务验收、编译/运行或变更边界可靠性的 P0/P1 问题；不得写 P2/P3、优化、风格、猜测风险或无关历史债。
- 不得扩散整改项：发现 P0/P1 阻断后只写当前任务闭环必需项；不要沿着一个问题继续挖同类、相邻模块、风格优化或后续专题。
- 一次给齐：本轮所选范围内的当前阻断项必须一次性汇总；多个证据属于同一失败时合并为一个整改项并给出验收标准，禁止挤牙膏式追加轮次。
- 复验边界：若这是 goon 整改后的复验，只核验 goon 已列项及整改引入的直接 P0/P1 阻断，不重新全量扫描制造新轮次。
- 方案稳定：goon 写失败事实 + 验收标准，除非唯一安全路径明确，否则不强制或反复切换 A/B 实现方案。
- 验证预算：使用最小受影响验证目标且一次绿色即固定；未经用户明确授权不得运行全量/工作区 gate 或重复绿色检查。
- 到点停止：完成一次任务边界内核验和必要最小验证后立即写结论；若证据不足，只记录未验证范围，不继续搜索新问题。
- **深度验收**：若参数解析中检测到 `深度` 指令，逐文件读取变更内容与任务要求比对；否则按标准粒度验收。
- **严格模式**：若参数解析中检测到 `严格` 指令，在当前任务验收边界内提高敏感度；仍只列 P0/P1，不列 P2/P3/优化项。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- goon 写入：写入前必须清空 `<GOON_PATH>` 原始内容，再写入本轮验收发现的当前待整改项。
- **写回校验**：执行写回前必须验证目标文件路径与隔离锁定路径一致；若不一致，立即停止并报告路径冲突，不得写入。
- 内容边界：`<GOON_PATH>` 只保存当前待整改项，不写 Changes、历史记录或已完成项。
- 无整改项：若无待整改项，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- 禁止事项：不得修改 `<TASK_PATH>` 的 Changes。
- 隔离约束：全程不得读取、编辑或创建除 `<TASK_PATH>` 和 `<GOON_PATH>` 以外的任何 `task-*.md` 或 `goon-*.md` 文件。

## Verification

完成后说明验证结论、整改项数量，以及写回的 goon 文件路径。

## Summary

报告验收结论、发现的问题数量以及 goon 文件内容摘要。

## Next Steps

End 完成后的典型路径：
- 无整改项 → 任务已完成，闭环结束
- 有整改项 → `/mxt-goon <编号>` 或 `$mxt-goon <编号>`
- 如遇新 BUG → `/mxt-debug <描述>` 或 `$mxt-debug <描述>`

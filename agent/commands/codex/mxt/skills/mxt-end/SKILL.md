---
name: mxt-end
description: Use when the user asks Codex to verify an R2MO task by number, such as "$mxt-end 001" or "mxt-end 001"; reads .r2mo/task/task-xxx.md and writes only current remediation items to .r2mo/task/goon-xxx.md.
---

# MXT End

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

Verify an R2MO task by three-digit task number and write the aligned goon file as a temporary remediation queue for another Agent.

## Core Acceptance Constraints

These constraints are part of the skill contract and override broad or perfectionist verification instincts:

1. Repository rules and MDC files are hard constraints. If a verification-budget rule exists, obey it before any default-full or additive wording.
2. `/mxt-end` is risk-managed task acceptance, not a perfect-system audit. Do not require every unrelated line, test, warning, or historical defect to be perfect before closing the current task.
3. Write goon items only for P0/P1 defects that directly break the current task acceptance, create a compile/runtime blocker, or make the delivered feature unreliable in the changed boundary.
4. Do not write P2/P3 improvements, style nits, speculative risks, unrelated legacy debt, or optional refactors as goon items.
5. The first end pass must produce one complete blocker package for the chosen scope. Do not drip-feed findings across rounds; if several facts describe one acceptance failure, group them under one item with clear acceptance criteria.
6. After a goon remediation round, verify only the listed goon items plus immediate blockers caused by that remediation. Do not rescan the whole task to invent new rounds unless a new P0/P1 compile/runtime blocker appears.
7. Keep the acceptance scale stable. Do not flip between A/B implementation prescriptions; describe the failing fact and the acceptance criterion, and prescribe an implementation only when there is a single safe required path.
8. Use the smallest affected verification target once. A green result is final evidence for that scope; do not repeat green checks or run full/workspace gates unless the user explicitly authorizes them.
9. `Deep` or `Strict` mode can increase scrutiny inside the current task scope, but cannot override the P0/P1 threshold, task isolation, or verification-budget rules.
10. If evidence is insufficient within the allowed budget, report the exact unverified scope instead of continuing slow, repetitive analysis.
11. **收敛验收**: first compare the task body, Plan, Changes-declared scope, and smallest affected verification result. 禁止深挖 task-external implementation details, legacy debt, whole-workspace potential risks, speculative reasoning, or "just one more area" checks.
12. **不得扩散整改项**: after finding a P0/P1 blocker, write only the items required to close the current task loop. Do not follow the issue into sibling modules, style improvements, adjacent risk classes, or follow-up topics.
13. **到点停止**: after one bounded task-scope review and the necessary minimal verification, write the result immediately. If evidence is insufficient, record the exact unverified scope instead of searching for new problems.

## Arguments

The user must provide a three-digit number such as `001`.

If the number is missing, scan `.r2mo/task/` for `task-*.md` files, read the `title` and `status` from each file's frontmatter, list the number and title for the user to choose from, and continue with the selected number. If no `task-*.md` files exist, tell the user to create a task first.

If the number is provided but does not match `^[0-9]{3}$`, stop and say:

`请使用 $mxt-end 001 格式执行，其中 001 是三位数字任务编号。`

## Workflow

1. Load and follow repository instructions: `AGENTS.md`, `CLAUDE.md`, `CODEX.md` when present, project MDC rules when present, and `~/.codex/rules/r2mo-task-workflow.md` when present. The Core Acceptance Constraints above are mandatory.
2. Set the task path to `.r2mo/task/task-<number>.md`.
3. Set the goon path to `.r2mo/task/goon-<number>.md`.
4. If the task file is missing, do not guess another number and do not read another task file; immediately ask the user for the latest task number.
5. Read the body after the frontmatter first. If it is empty or whitespace-only, stop immediately and return: `<TASK_PATH> 正文为空，当前不执行 /mxt-end，请先补充任务内容。`
6. Before reading the task body, editing files, or running verification, print only the final prompt below in a Markdown code block, replacing `<TASK_PATH>` and `<GOON_PATH>` with the actual paths.
7. Execute the final prompt.

Final prompt:

任务：验收 `<TASK_PATH>`，并生成 `<GOON_PATH>` 整改队列。

- 输入范围：读取 `<TASK_PATH>` frontmatter 之后的正文。
- 前置校验：若正文为空或仅包含空白字符，返回“任务正文为空，未执行验收”，且不修改任何文件。
- 验收依据：对照任务正文、已有 Plan、已有 Changes 和当前代码状态判断任务是否完成。
- 核心约束：这是风险受控的任务验收，不是完美系统审计；仓库 MDC/验证预算优先。
- 收敛验收：先对照任务正文、Plan、Changes 声明范围和最小受影响验证结果；禁止深挖任务外实现细节、历史债、全仓潜在风险、可能性推演或“顺手再看一下”的额外范围。
- 整改项门槛：只写直接破坏当前任务验收、编译/运行或变更边界可靠性的 P0/P1 问题；不得写 P2/P3、优化、风格、猜测风险或无关历史债。
- 不得扩散整改项：发现 P0/P1 阻断后只写当前任务闭环必需项；不要沿着一个问题继续挖同类、相邻模块、风格优化或后续专题。
- 一次给齐：本轮所选范围内的当前阻断项必须一次性汇总；多个证据属于同一失败时合并为一个整改项并给出验收标准，禁止挤牙膏式追加轮次。
- 复验边界：若这是 goon 整改后的复验，只核验 goon 已列项及整改引入的直接 P0/P1 阻断，不重新全量扫描制造新轮次。
- 方案稳定：goon 写失败事实 + 验收标准，除非唯一安全路径明确，否则不强制 A/B 实现方案。
- 验证预算：使用最小受影响验证目标且一次绿色即固定；未经用户明确授权不得运行全量/工作区 gate 或重复绿色检查。
- 到点停止：完成一次任务边界内核验和必要最小验证后立即写结论；若证据不足，只记录未验证范围，不继续搜索新问题。
- goon 标题：`<GOON_PATH>` frontmatter 的 title 必须为 `整改-` + `<TASK_PATH>` frontmatter 中的 title。
- goon 写入：写入前必须清空 `<GOON_PATH>` 原始内容，再写入本轮验收发现的当前待整改项。
- 内容边界：`<GOON_PATH>` 只保存当前待整改项，不写 Changes、历史记录或已完成项。
- 无整改项：若无待整改项，将 `<GOON_PATH>` 重写为空整改单或无待整改项状态。
- 禁止事项：不得修改 `<TASK_PATH>` 的 Changes。

`<GOON_PATH>` 必须与任务编号对齐，例如 `.r2mo/task/task-001.md` 对应 `.r2mo/task/goon-001.md`。

## Verification

Report the verification result, remediation item count, and written `.r2mo/task/goon-xxx.md` path. Do not append Changes to the goon file or task file in this stage.

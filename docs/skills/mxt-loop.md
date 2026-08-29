# $mxt-loop / /mxt:loop

## 基本介绍

`mxt-loop` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-loop` 调用；Claude Code / OpenCode 中对应 `/mxt:loop`。

## 用途

自动执行 RUN → END → GOON → END_REVIEW 的闭环流程，直到整改队列清空或遇到阻塞。

执行时必须开启两个独立会话：

- **Development session**：执行 RUN/GOON，只负责实现与整改。
- **Review session**：执行 END/END_REVIEW，只负责对抗式审查与写 goon。

两个会话不得共享上下文，禁止在同一会话内自我审查。会话之间每次通信只允许白名单工件：task/goon 文件、规则路径、变更文件清单、diff、验证命令与结果。

## 适用场景

- 任务边界清晰，希望自动推进完整闭环。
- 需要断点/检查点式恢复，而不是人工逐条输入。

## 输入

- 三位任务编号，例如 `001`。
- 内部使用 task/goon 文件作为循环状态。

## 写回 / 输出

- `.r2mo/task/task-NNN.md` 的 Changes。
- `.r2mo/task/goon-NNN.md` 的当前整改状态。

## 闭环契约

- 所有 `mxt-*` 命令都以磁盘状态和真实证据为闭环依据，不以对话记忆或自述结论作为完成依据。
- 输出必须包含可追踪的输入、变更/执行范围、验证方式和实际结果；无法验证的内容不得宣称完成。
- 跨命令交接只传递磁盘工件和明确证据，不传递未落盘摘要或无关上下文。
- 失败必须显式停止并保留恢复信息；不允许通过降低标准、扩大范围或改写目标来制造“完成”。

## 注意事项

- 循环不代表无边界扫描；仍以 task 要求和 goon 项为准。
- Review session 采用对抗式视角：默认实现不完整，逐项核对 task、diff、验证证据与变更文件清单。
- 只有 P0/P1 且可验证的真实整改项才写入 goon；样式意见、泛化建议和无关历史问题会被拒绝。
- GOON 后由独立会话复核，只保留未解决项；连续两轮项数不下降则标记阻塞并停止。
- 无法开启两个独立会话时必须停止并报告，不允许降级为自我审查。
- 遇到验证失败或外部阻塞时应停止并报告。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-loop/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/loop.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/loop.md`

## 命令执行记录

```bash
$mxt-loop 001
$mxt-goon 001 && $mxt-end 001
```

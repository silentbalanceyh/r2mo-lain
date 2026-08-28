# $mxt-end / /mxt:end

## 基本介绍

`mxt-end` 是 `mxt ai-cmd` 安装到 AI 工具中的任务工作流 Skill。Codex 中以 `$mxt-end` 调用；Claude Code / OpenCode 中对应 `/mxt:end`。

## 用途

按 task 要求验证完成度；只把当前阻塞整改项写入 `goon-NNN.md`。

## 适用场景

- `run` 或 `goon` 后需要验收。
- 需要把 P0/P1 阻塞问题转成可执行整改队列。

## 输入

- 三位任务编号，例如 `001`。
- 可选 `Deep` 做更深边界比对，`Strict` 在当前任务边界内提高敏感度。

## 写回 / 输出

- `.r2mo/task/goon-NNN.md`。
- 不会修改 task 的 Changes。无整改项时写成空/无待办状态。

## 内容匹配验证（强制 — 不可跳过）

最常见的验证失败是只检查 Changes 条目**是否存在**（文件被改过、函数被加了），而不验证变更的**实际内容**是否**匹配任务需求**。存在 ≠ 正确。

### 三层验证协议

每个 Changes 条目必须通过全部三层，任意一层失败即为 P0/P1 整改项。

#### Layer 1: 存在性检查（变更是否发生？）

- 验证 Changes 中提到的文件/函数/配置是否确实存在于磁盘上。
- 使用 `git diff`、`git show`、`grep` 或直接读取文件。
- 如果文件或函数不存在 → **P0 FAIL**。

#### Layer 2: 内容匹配检查（变更是否匹配需求？）

- 读取**任务需求**（来自 task 正文，不仅是 Changes 摘要）。
- 读取**磁盘上的实际变更内容**（不仅是 Changes 描述）。
- 对比：实现是否真正做到了任务要求？
- 检查项：
  - **桩/占位符**：函数存在但 body 为空、返回硬编码值、含 `TODO`/`FIXME`/`not implemented` — **P0 FAIL**
  - **错误逻辑**：函数存在、签名匹配，但实现逻辑不满足需求 — **P0 FAIL**
  - **部分实现**：只处理了需求的一部分，其余缺失 — **P1 FAIL**
  - **标识符命名错误**：变更存在但名称/模式与任务指定不同 — **P1 FAIL**（仅当任务明确命名时）
  - **位置错误**：文件存在于与任务指定不同的目录/模块 — **P1 FAIL**（仅当任务明确指定位置时）
- 内容匹配 → PASS，进入 Layer 3

#### Layer 3: 需求完整性检查（是否覆盖全部需求？）

- 从 task 正文中提取每条显式需求（bullet、编号列表、"必须"/"需要" 语句）。
- 将每条需求与 Changes 条目和实际代码交叉比对。
- 任何需求无对应变更 → **P1 FAIL**（缺失需求）。
- 变更存在但实现不完全满足 → **P0/P1 按严重性**。

### 验证证据格式

为每个 Changes 条目打印一行裁定：

```
✅ [L1:exists] [L2:content-match] [L3:requirement-covered] path/to/file — Changes summary
❌ [L1:exists] [L2:FAIL: stub/placeholder] path/to/file — function body is empty
❌ [L1:exists] [L2:FAIL: wrong logic] path/to/file — does not handle edge case X
❌ [L1:FAIL: missing] path/to/file — file not found on disk
❌ [L3:FAIL: missing requirement] — task requires Y but no Changes entry addresses it
```

### 反模式（必须避免）

1. **"文件存在所以完成了"** — 只读 Changes 摘要不读实际文件内容
2. **"Changes 说已实现"** — 把 Changes 描述当证据，实际必须读磁盘内容
3. **"编译通过所以正确"** — 编译只证明语法，不证明逻辑正确性
4. **"日志无错误"** — 无错误不等于需求已满足
5. **"函数名匹配"** — 名字匹配不读函数体，body 可能是桩
6. **跳读 Changes 不映射需求** — Changes 可能列了文件但不映射到具体需求
7. **"Changes 描述看起来对"** — Changes 描述是声明不是证据，必须读实际代码

## 注意事项

- 只记录直接阻塞任务验收的 P0/P1。
- 整改项标题格式必须是 `## Remediation Item N — <title>`。
- 内容匹配验证是强制步骤，不可跳过或简化。

## 源头

- Codex Skill：`agent/commands/codex/mxt/skills/mxt-end/SKILL.md`
- Claude Code 命令：`agent/commands/claude/mxt/commands/end.md`
- OpenCode 命令：`agent/commands/opencode/mxt/commands/end.md`

## 命令执行记录

```bash
$mxt-end 001
$mxt-end 001 Deep
$mxt-end 001 Strict
```

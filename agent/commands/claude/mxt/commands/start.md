---
description: "拉起当前项目环境：参考 mdc 规则启动，已启动则重启编译后拉起"
argument-hint: ""
---

# /mxt:start

拉起当前项目开发环境：参考 mdc 规则，若环境已启动则停止后编译再拉起。

The user invoked this command with: $ARGUMENTS

## 参数解析

本命令无参数。直接执行环境拉起流程。

**硬规则**：必须参考 mdc 规则 | 已启动→先停止再编译再启动 | 确保 starter 稳定性

## Workflow

1. 先读取并遵守当前仓库的 `AGENTS.md`、`CLAUDE.md`、`CODEX.md`（若存在），以及它们引用的所有规则文件；扫描项目中所有可检索的 `.mdc` 规则文件（`.claude/rules/`、`.codex/rules/`、`.cursor/rules/`、`.opencode/` 及其他任意路径下的 `.mdc`），以及 `~/.codex/rules/r2mo-task-workflow.md`（若存在）。
2. 从 mdc 规则中检索项目启动相关命令（如 `./dev-build.sh`、`./dev-start.sh`、`npm run dev` 等）。
3. 基于启动命令特征（脚本名/路径，从 mdc 中提取）检测当前项目进程是否已启动（不使用全局 node/java 进程检测）：
   - 若已启动，先执行停止操作（`./dev-stop.sh` 或对应停止命令）。
   - 若未启动，继续下一步。
4. 编译最新版（执行 `./dev-build.sh` 或对应构建命令）。
5. 拉起环境（执行 `./dev-start.sh` 或对应启动命令），确保拉起环境的整体稳定性，不出现其他额外流程。

## Verification

完成后说明启动命令、编译结果和启动状态。

## 闭环指引

Start 完成后的典型路径：
- 开发调试 → `/mxt:debug <描述>`
- 执行任务 → `/mxt:run <编号>`
- 同步项目 → `/mxt:sync`

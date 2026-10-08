# mxt task

## 用途

按项目根/.r2mo 下的 task/thread 对齐标准 task 槽位；超过 thread 的扩展任务默认保留，用户可交互选择归档。thread 缺失时默认 30。

## 参数

无。

## 说明

- 可先运行 `mxt help -c task` 查看 CLI 内置帮助。
- 超过 `thread` 的任务不会被自动归档或删除；只有用户在交互菜单中显式选择时才归档。
- AI 侧 `/mxt:task` / `$mxt-task` / `/mtask` 是自然语言扩展任务工作流，与 CLI 槽位管理命令不同：它必须传入需求，会在大于 `thread` 的槽位中查找或创建任务并立即执行。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c task
[MXT AI] SDD / Spec Driven Development ...

按项目根/.r2mo 下的 task/thread 对齐标准 task 槽位；thread 缺失时默认 30，超过阈值的扩展任务默认保留并支持交互选择归档

Usage:
mxt task [options]
$ echo $?
0
```

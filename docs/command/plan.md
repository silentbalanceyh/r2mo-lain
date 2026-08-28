# mxt plan

## 用途

从项目根或 .r2mo 目录下的 task/ 中选择任务，生成 Plan 阶段提示词到剪贴板

## 参数

无。

## 说明

- 可先运行 `mxt help -c plan` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c plan
[MXT AI] SDD / Spec Driven Development ...

从项目根或 .r2mo 目录下的 task/ 中选择任务，生成 Plan 阶段提示词到剪贴板

Usage:
mxt plan [options]
$ echo $?
0
```

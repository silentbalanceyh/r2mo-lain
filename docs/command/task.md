# mxt task

## 用途

按项目根/.r2mo 下的 task/thread 对齐 task 槽位；thread 缺失时默认 20，满队列时交互选择转历史任务

## 参数

无。

## 说明

- 可先运行 `mxt help -c task` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c task
[MXT AI] SDD / Spec Driven Development ...

按项目根/.r2mo 下的 task/thread 对齐 task 槽位；thread 缺失时默认 20，满队列时交互选择转历史任务

Usage:
mxt task [options]
$ echo $?
0
```

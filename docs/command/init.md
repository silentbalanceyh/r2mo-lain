# mxt init

## 用途

初始化 R2MO 规范目录结构

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 目标目录（默认为当前目录） | string |

## 说明

- 可先运行 `mxt help -c init` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c init
[MXT AI] SDD / Spec Driven Development ...

初始化 R2MO 规范目录结构

Usage:
mxt init [options]

Options:
[-d|--dir]               目标目录（默认为当前目录） (默认: .)
$ echo $?
0
```

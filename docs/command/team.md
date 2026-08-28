# mxt team

## 用途

根据 DPA 架构位置写入 .r2mo/mxt.yaml 角色（Team Leader / Backend Actor / Frontend Actor）

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 目标目录（默认为当前目录） | string |

## 说明

- 可先运行 `mxt help -c team` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c team
[MXT AI] SDD / Spec Driven Development ...

根据 DPA 架构位置写入 .r2mo/mxt.yaml 角色（Team Leader / Backend Actor / Frontend Actor）

Usage:
mxt team [options]

Options:
[-d|--dir]               目标目录（默认为当前目录） (默认: .)
$ echo $?
0
```

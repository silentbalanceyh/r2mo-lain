# mxt domain

## 用途

在指定目录执行 r2mo_proto 脚本生成 Protobuf

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 目标目录（默认为当前目录） | string |
| `-e` / `--entity` | 从 Entity 生成（true）或从 SQL 生成（false），默认 true | boolean |

## 说明

- 可先运行 `mxt help -c domain` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c domain
[MXT AI] SDD / Spec Driven Development ...

在指定目录执行 r2mo_proto 脚本生成 Protobuf

Usage:
mxt domain [options]

Options:
[-d|--dir]               目标目录（默认为当前目录）
[-e|--entity]            从 Entity 生成（true）或从 SQL 生成（false），默认 true
$ echo $?
0
```

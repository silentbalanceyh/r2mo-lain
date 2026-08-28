# mxt openapi

## 用途

从各子项目 src/main/resources/openapi 提取 Operation/Schema 的 md，拷贝到 -ui/.r2mo/api/ 并保持结构

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 项目根目录（默认当前目录） | string |

## 说明

- 可先运行 `mxt help -c openapi` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c openapi
[MXT AI] SDD / Spec Driven Development ...

从各子项目 src/main/resources/openapi 提取 Operation/Schema 的 md，拷贝到 -ui/.r2mo/api/ 并保持结构

Usage:
mxt openapi [options]

Options:
[-d|--dir]               项目根目录（默认当前目录）
$ echo $?
0
```

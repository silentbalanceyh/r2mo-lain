# mxt app

## 用途

创建 R2MO/Spring 或 ZERO/Vertx 应用

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-n` / `--name` | 应用名称（必填） | string |

## 说明

- 可先运行 `mxt help -c app` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c app
[MXT AI] SDD / Spec Driven Development ...

创建 R2MO/Spring 或 ZERO/Vertx 应用

Usage:
mxt app [options]

Options:
[-n|--name]              应用名称（必填）
$ echo $?
0
```

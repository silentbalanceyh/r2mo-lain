# mxt help

## 用途

显示帮助的详细信息！

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-c` / `--command` | 命令名称（Command） | boolean |

## 说明

- 可先运行 `mxt help -c help` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c help
[MXT AI] SDD / Spec Driven Development ...

显示帮助的详细信息！

Usage:
mxt help [options]

Options:
[-c|--command]           命令名称（Command）
$ echo $?
0
```

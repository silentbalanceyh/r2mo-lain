# mxt open

## 用途

使用指定的 AI 工具打开项目！

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 指定要打开的目录路径 | string |

## 说明

- 可先运行 `mxt help -c open` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c open
[MXT AI] SDD / Spec Driven Development ...

使用指定的 AI 工具打开项目！

Usage:
mxt open [options]

Options:
[-d|--dir]               指定要打开的目录路径
$ echo $?
0
```

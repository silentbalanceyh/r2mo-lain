# mxt mod

## 用途

拉取 r2mo-spec 到 .r2mo/repo，并拷贝项目根与各子模块 openapi 到 .r2mo/api/

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 项目根目录（默认为当前目录） | string |

## 说明

- 可先运行 `mxt help -c mod` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c mod
[MXT AI] SDD / Spec Driven Development ...

拉取 r2mo-spec 到 .r2mo/repo，并拷贝项目根与各子模块 openapi 到 .r2mo/api/

Usage:
mxt mod [options]

Options:
[-d|--dir]               项目根目录（默认为当前目录） (默认: .)
$ echo $?
0
```

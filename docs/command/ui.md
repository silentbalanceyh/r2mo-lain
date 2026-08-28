# mxt ui

## 用途

从 r2mo-ui 模板创建/更新 UI 子项目（Rust/WASM + Tauri）

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-n` / `--name` | 项目名称（DPA 结构下建议 xxx-ui） | string |
| `-d` / `--dir` | 父目录（默认为当前目录） | string |
| `-u` / `--update` | 更新模式：同步根 MD、components、utils，其他有变化文件多选更新 | boolean |

## 说明

- 可先运行 `mxt help -c ui` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c ui
[MXT AI] SDD / Spec Driven Development ...

从 r2mo-ui 模板创建/更新 UI 子项目（Rust/WASM + Tauri）

Usage:
mxt ui [options]

Options:
[-n|--name]              项目名称（DPA 结构下建议 xxx-ui） (默认: )
[-d|--dir]               父目录（默认为当前目录） (默认: .)
[-u|--update]            更新模式：同步根 MD、components、utils，其他有变化文件多选更新
$ echo $?
0
```

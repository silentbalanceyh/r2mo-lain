# mxt mcp

## 用途

配置 MCP Skills Server，整合项目和全局技能

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-c` / `--check` | 仅检查依赖，不配置 | boolean |
| `-d` / `--dir` | 项目目录（默认为当前目录），MCP 脚本与配置写入此目录 | string |

## 说明

- 可先运行 `mxt help -c mcp` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c mcp
[MXT AI] SDD / Spec Driven Development ...

配置 MCP Skills Server，整合项目和全局技能

Usage:
mxt mcp [options]

Options:
[-c|--check]             仅检查依赖，不配置
[-d|--dir]               项目目录（默认为当前目录），MCP 脚本与配置写入此目录 (默认: .)
$ echo $?
0
```

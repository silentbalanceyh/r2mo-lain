# mxt focus

## 用途

在 DPA 父项目下维护 .r2mo/focus/ 与 rachel-mxt.yaml，绑定后端/前端/集体任务；-d 完成并备份；-c 同步 .r2mo/api/metadata.yaml

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--done` | 完成：按日期备份 focus 配置与三任务后视为历史记录 | boolean |
| `-c` / `--config` | 配置：同步 -api/-ui/父项目 .r2mo/api/metadata.yaml | boolean |

## 说明

- 可先运行 `mxt help -c focus` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c focus
[MXT AI] SDD / Spec Driven Development ...

在 DPA 父项目下维护 .r2mo/focus/ 与 rachel-mxt.yaml，绑定后端/前端/集体任务；-d 完成并备份；-c 同步 .r2mo/api/metadata.yaml

Usage:
mxt focus [options]

Options:
[-d|--done]              完成：按日期备份 focus 配置与三任务后视为历史记录
[-c|--config]            配置：同步 -api/-ui/父项目 .r2mo/api/metadata.yaml
$ echo $?
0
```

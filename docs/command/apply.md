# mxt apply

## 用途

从远程仓库安装技能到当前项目（默认）；-i 将当前项目 skills/ 反馈到 Z_LAIN_SKILL/skills

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-r` / `--remote` | 远程仓库名（可选，默认仍从远程安装） | string |
| `-i` / `--import` | 反馈模式：将当前项目 skills/ 拷贝到 Z_LAIN_SKILL/skills | boolean |

## 说明

- 可先运行 `mxt help -c apply` 查看 CLI 内置帮助。

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c apply
[MXT AI] SDD / Spec Driven Development ...

从远程仓库安装技能到当前项目（默认）；-i 将当前项目 skills/ 反馈到 Z_LAIN_SKILL/skills

Usage:
mxt apply [options]

Options:
[-r|--remote]            远程仓库名（可选，默认仍从远程安装）
[-i|--import]            反馈模式：将当前项目 skills/ 拷贝到 Z_LAIN_SKILL/skills
$ echo $?
0
```

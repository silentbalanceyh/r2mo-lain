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
mxt domain
mxt domain -d . -e
```

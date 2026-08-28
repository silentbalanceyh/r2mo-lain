# mxt dict

## 用途

从 .r2mo/api/components/schemas 读取结构并导出字典到 .r2mo/data/dbdict；-r 逆向从 dbdict 的 yaml 生成 flyway SQL

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 项目根目录（默认为当前目录） | string |
| `-r` / `--reverse` | 逆向：以 .r2mo/data/dbdict 的 yaml 为输入，在 -domain 或当前项目 flyway 目录下生成 SQL 脚本 | boolean |

## 说明

- 可先运行 `mxt help -c dict` 查看 CLI 内置帮助。

## 命令执行记录

```bash
mxt dict
mxt dict -r
```

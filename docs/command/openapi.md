# mxt openapi

## 用途

从各子项目 src/main/resources/openapi 提取 Operation/Schema 的 md，拷贝到 -ui/.r2mo/api/ 并保持结构

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 项目根目录（默认当前目录） | string |

## 说明

- 可先运行 `mxt help -c openapi` 查看 CLI 内置帮助。

## 命令执行记录

```bash
mxt openapi
mxt openapi -d .
```

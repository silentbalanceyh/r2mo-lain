# mxt 命令总览

## 总体介绍

`mxt` 的命令分成两层：

- **命令定义层**：`src/commander/*.json`
- **命令执行层**：`src/executor/execute*.js`
- **文档层**：本目录 `docs/command/*.md`

本页是命令索引页，只负责说明命令来源、安装/执行的阅读入口，以及各子命令文档的入口；每个子命令的参数、行为、执行记录放到对应的专用文档中。

## 安装位置与配置来源

`mxt` 命令本身通过 CLI 安装在系统 PATH 中；命令文档与实现则对应下列源头：

| 位置 | 内容 | 说明 |
|:---|:---|:---|
| `src/commander/*.json` | 命令声明 | 命令名、描述、选项定义 |
| `src/executor/execute*.js` | 命令执行器 | 实际命令处理逻辑 |
| `docs/command/*.md` | 命令专用文档 | 每个子命令一页，带执行记录块 |
| `docs/command/README.md` | 命令索引 | 只做总体介绍与跳转 |

## 索引

### 环境初始化

- [mxt app](app.md) — 创建 R2MO/Spring 或 ZERO/Vertx 应用
- [mxt apply](apply.md) — 从远程仓库安装技能到当前项目（默认）；-i 将当前项目 skills/ 反馈到 Z_LAIN_SKILL/skills
- [mxt env](env.md) — 环境信息检查！
- [mxt focus](focus.md) — 在 DPA 父项目下维护 .r2mo/focus/ 与 rachel-mxt.yaml，绑定后端/前端/集体任务；-d 完成并备份；-c 同步 .r2mo/api/metadata.yaml
- [mxt help](help.md) — 显示帮助的详细信息！
- [mxt init](init.md) — 初始化 R2MO 规范目录结构
- [mxt mcp](mcp.md) — 配置 MCP Skills Server，整合项目和全局技能
- [mxt open](open.md) — 使用指定的 AI 工具打开项目！
- [mxt team](team.md) — 根据 DPA 架构位置写入 .r2mo/mxt.yaml 角色（Team Leader / Backend Actor / Frontend Actor）
- [mxt ui](ui.md) — 从 r2mo-ui 模板创建/更新 UI 子项目（Rust/WASM + Tauri）

### 需求分析

- [mxt docs](docs.md) — 使用 Obsidian 打开文档目录
- [mxt menu](menu.md) — 扫描 src/pages 下 menu.yaml，打印完整树型菜单（name, text, icon）
- [mxt mod](mod.md) — 拉取 r2mo-spec 到 .r2mo/repo，并拷贝项目根与各子模块 openapi 到 .r2mo/api/
- [mxt openapi](openapi.md) — 从各子项目 src/main/resources/openapi 提取 Operation/Schema 的 md，拷贝到 -ui/.r2mo/api/ 并保持结构

### 开发实施

- [mxt admin](admin.md) — 根据项目需求文档生成前端页面结构
- [mxt dict](dict.md) — 从 .r2mo/api/components/schemas 读取结构并导出字典到 .r2mo/data/dbdict；-r 逆向从 dbdict 的 yaml 生成 flyway SQL
- [mxt domain](domain.md) — 在指定目录执行 r2mo_proto 脚本生成 Protobuf
- [mxt mmr0](mmr0.md) — 从 r2mo-spec 仓库下载并生成 Flyway SQL 文件
- [mxt mmr2](mmr2.md) — 从 r2mo-spec 仓库下载并生成 Entity 类

### SDD 开发

- [mxt ai-cmd](ai-cmd.md) — 安装 mxt AI 命令到 Claude Code / Codex / OpenCode；Codex 安装为 plugin skills
- [mxt ask](ask.md) — 从模板目录中选择提示词并复制到剪切板
- [mxt plan](plan.md) — 从项目根或 .r2mo 目录下的 task/ 中选择任务，生成 Plan 阶段提示词到剪贴板
- [mxt run](run.md) — 从项目根/.r2mo 下的 task 中选择任务，打印内容并确认后生成提示词到剪贴板
- [mxt task](task.md) — 按项目根/.r2mo 下的 task/thread 对齐 task 槽位；thread 缺失时默认 20，满队列时交互选择转历史任务

## 命令专用章节说明

每个子命令都保留可复制的 `bash` 执行块，便于在任务或排查中留下命令执行记录。子文档中会继续介绍该命令的参数、行为和写回影响，这里不重复。

## 命令执行记录

```bash
mxt help
mxt help -c docs
mxt docs
```

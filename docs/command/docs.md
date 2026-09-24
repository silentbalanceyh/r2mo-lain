# mxt docs

## 用途

使用 Obsidian 打开文档目录

## 参数

| 参数 | 说明 | 类型 |
|:---|:---|:---|
| `-d` / `--dir` | 目标目录（默认当前目录） | string |
| `-r` / `--remove` | 清理指定目录的 Obsidian 配置（与 -d 互斥） | string |

## 说明

- 仓库以规范化绝对路径为身份，不同项目下的 `.r2mo` 分别注册；重复打开同一路径复用 Obsidian 分配的 Vault ID。
- 已注册路径先反向查找 Vault ID，再通过 `obsidian://open?vault=<ID>` 发送打开/聚焦请求，不执行 `eval`。输出“已发送打开请求”不等于窗口完成加载。
- 只有未注册路径才调用 Obsidian 内部 `vault-open`，且明确指定一个注册表中标记为打开的执行仓库，避免 CLI 按当前工作目录另开父仓库。
- 新仓库注册依赖已启用的 Obsidian CLI / `eval`，内部 IPC 随版本可能变化。最多等待 10 秒，不自动重试或自行写入注册表；无可用执行仓库时明确报错。
- Windows 已注册仓库通过系统 URI 处理器打开；新仓库通过安装目录中的 `Obsidian.com` 调用 CLI。Windows 尚未完成实机验收。
- 回归验证：`node scripts/test-docs-vault.js`。
- `mxt docs` 只复制模板源头中的 Obsidian 配置和插件，不在运行时联网更新插件。插件更新应先维护 `src/_template/LAIN/.obsidian/plugins` 源头。
- 运行时会打印 `[MXT AI]` 插件覆盖日志，区分 `[加载]` 和 `[仅复制]`。
- 插件覆盖以源头为准：源头已删除的插件会从目标 `.obsidian/plugins/` 中清理，避免消费项目残留旧插件。

## 默认启用插件

以下插件来自模板源头 `src/_template/LAIN/.obsidian/plugins`，启用状态由 `src/_template/LAIN/.obsidian/community-plugins.json` 控制。表格不记录版本号，版本以源头插件目录中的 `manifest.json` 为准。

| 插件 ID | 插件名 | 说明 |
|:---|:---|:---|
| `dataview` | Dataview | 为 Markdown 笔记提供数据查询和动态视图。 |
| `obsidian-excalidraw-plugin` | Excalidraw | 在 Obsidian 中编辑和查看 Excalidraw 绘图。 |
| `obsidian-kanban` | Kanban | 使用 Markdown 文件维护看板。 |
| `obsidian-tasks-plugin` | Tasks | 跟踪、筛选和管理 vault 中的任务。 |
| `templater-obsidian` | Templater | 提供模板脚本和自动化能力。 |
| `terminal` | Terminal | 在 Obsidian 中集成终端会话。 |
| `obsidian-shellcommands` | Shell commands | 预定义并执行系统命令，可绑定快捷键或 URI。 |
| `obsidian-git` | Git | 为 Obsidian vault 提供 Git 备份和版本控制能力。 |
| `obsidian-meta-bind-plugin` | Meta Bind | 为笔记添加可交互字段、元数据显示和按钮。 |

## 命令执行记录

```bash
$ REPO="/Users/lang/zero-cloud/app-zero/r2mo-matrix/r2mo-lain"
$ WORK_DIR="/var/folders/sj/rxs6q2ds7xx8rp3vzddfzxsh0000gn/T/mxt-docs-record-eDCd9K"
$ cd "$WORK_DIR"
$ node "$REPO/src/mxt.js" help -c docs
[MXT AI] SDD / Spec Driven Development ...

使用 Obsidian 打开文档目录

Usage:
mxt docs [options]

Options:
[-d|--dir]               目标目录（默认当前目录）
[-r|--remove]            清理指定目录的 Obsidian 配置（与 -d 互斥）
$ echo $?
0
```

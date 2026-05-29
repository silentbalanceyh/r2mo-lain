# AI Agents 集成说明

本文档用于帮助 AI 编码助手理解项目结构和工作流程。通过遵循本文档中的规范，AI 可以更准确地协助开发工作。

## 项目工作流程

1. **需求分析** - 定义和分析业务需求
2. **任务规划** - 将需求分解为可执行的任务
3. **角色分配** - 为每个任务分配合适的 AI 或人类角色
4. **代码实现** - 执行具体任务并生成代码
5. **测试验证** - 验证实现是否满足需求
6. **归档提交** - 将完成的工作归档并提交

## 可用 Agents

### 领域建模师
- Arg Name: `mxt-datamodel`
- 用途: 根据需求文档设计领域模型和数据结构
- id = mxt-datamodel, uri = https://s.trae.ai/a/a9dcaa

### 系统需求分析师
- Arg Name: `mxt-system-req`
- 用途: 分析系统级需求并生成技术规格
- id = mxt-system-req, uri = https://s.trae.ai/a/d0c6b9

### 模块需求分析师
- Arg Name: `mxt-module-req`
- 用途: 分析模块级需求并细化功能规格
- id = mxt-module-req, uri = https://s.trae.ai/a/c4fc46

### 任务规划师
- Arg Name: `mxt-task`
- 用途: 将需求分解为具体可执行的任务
- id = mxt-task, uri = https://s.trae.ai/a/1fdc4e

## MXT CLI 命令

### 基础命令

#### `mxt help [-c <command>]`
显示帮助信息。如果指定 `-c` 参数，则显示特定命令的详细帮助。

**示例：**
```bash
mxt help
mxt help -c init
```

#### `mxt env`
检查当前环境信息，包括 Node.js 版本、Python 版本等系统依赖。

**示例：**
```bash
mxt env
```

#### `mxt init [-d <dir>]`
初始化 Spec 工程，创建项目目录结构和模板文件。

**参数：**
- `-d, --dir`: 项目目录，如果不提供则使用当前目录

**示例：**
```bash
mxt init
mxt init -d ./my-project
```

### 开发工具命令

#### `mxt open [-d <dir>]`
使用指定的 AI 工具（Antigravity、Trae、Cursor）打开项目目录。

**参数：**
- `-d, --dir`: 指定要打开的目录路径，默认为当前目录

**示例：**
```bash
mxt open
mxt open -d ./src
```

#### `mxt app -n <name>`
创建新的 R2MO/Spring 或 ZERO/Vertx 应用。

**参数：**
- `-n, --name`: 应用名称（必填）

**示例：**
```bash
mxt app -n my-app
```

#### `mxt domain [-d <dir>]`
在指定目录中执行 `r2mo_proto.py` 脚本，用于处理 Maven 项目的领域模型。

**参数：**
- `-d, --dir`: 目标目录（默认为当前目录），必须是包含 `pom.xml` 的 Maven 项目根目录

**验证要求：**
- 目录必须包含 `pom.xml` 文件
- 必须存在 `{artifactId}-domain` 和 `{artifactId}-ui` 子模块

**示例：**
```bash
mxt domain
mxt domain -d ./my-maven-project
```

### 技能管理命令

#### `mxt apply -r [repo_name]`
从远程仓库安装技能到本地项目的指定目录。

**参数：**
- `-r, --remote`: 从远程仓库安装技能（可选指定仓库名）

**安装目标选择：**
- Cursor 默认 (`.claude/skills/`)
- Antigravity (`.agent/skills/`)
- Trae CN (`.trae/skills/`)
- Trae (`.trae/skills/`)

**示例：**
```bash
mxt apply -r
mxt apply -r anthropics/skills
```

#### `mxt mcp [-c]`
配置 MCP Skills Server，整合项目和全局技能，生成 Cursor 的 `mcp.json` 配置文件。

**参数：**
- `-c, --check`: 仅检查依赖，不进行配置

**功能：**
- 自动安装 MCP 依赖包到 `.r2mo/mcpserver` 目录
- 生成 `.cursor/mcp.json` 配置文件
- 将配置内容复制到剪切板

**示例：**
```bash
mxt mcp
mxt mcp -c
```

### 提示词管理命令

#### `mxt ask`
从模板目录中选择提示词并复制到剪切板。

**功能：**
- 从主项目的 `src/_template/R2MO/` 目录加载所有提示词模板
- 以表格形式显示模板的标题和版本
- 选择后提取 `--- BEGIN` 和 `--- END` 之间的内容
- 自动复制到剪切板并显示详细信息

**示例：**
```bash
mxt ask
```

## 项目目录结构

```
project/
├── .mxt/
│   ├── advanced/
│   ├── prompt/
│   ├── scripts/
│   └── template/
├── .claude/
│   └── skills/          # Cursor 技能目录
├── .agent/
│   └── skills/          # Antigravity 技能目录
├── .trae/
│   └── skills/          # Trae 技能目录
├── .r2mo/
│   ├── repo/            # 远程仓库缓存
│   └── mcpserver/       # MCP 服务器配置
├── .cursor/
│   └── mcp.json         # Cursor MCP 配置
├── integration/
├── source/
├── specification/
│   ├── .activities/
│   ├── .archives/
│   ├── actor/
│   ├── changes/
│   │   └── {change-id}/
│   │       ├── proposal.md
│   │       ├── tasks.md
│   │       └── tasks/
│   │           └── {task-id}.md
│   ├── project-model.md
│   ├── project.md
│   └── requirement.md
└── README.md
```

## 关键文件说明

### specification/project.md
项目概述文件，包含项目基本信息、技术栈、架构风格等。

### specification/project-model.md
项目数据模型文件，包含核心领域模型和数据结构定义。

### specification/requirement.md
项目需求文件，包含用户群描述、场景描述、功能需求等。

### specification/changes/{change-id}/proposal.md
变更提案文件，描述需求变更的内容和影响范围。

### specification/changes/{change-id}/tasks.md
任务列表文件，包含为实现变更所需执行的具体任务。

### specification/changes/{change-id}/tasks/{task-id}.md
具体任务文件，包含任务的详细说明和执行指南。

## 工作流程规范

### 项目初始化流程
1. 使用 `mxt init [-d <dir>]` 创建新的 Spec 工程
2. 编辑 `specification/project.md` 定义项目基本信息
3. 编辑 `specification/project-model.md` 定义领域模型
4. 编辑 `specification/requirement.md` 定义项目需求

### 技能管理流程
1. 使用 `mxt apply -r` 从远程仓库安装技能到项目
2. 使用 `mxt mcp` 配置 MCP Skills Server
3. 技能会自动整合到 Cursor 的 MCP 工具中

### 应用开发流程
1. 使用 `mxt app -n <name>` 创建新的应用项目
2. 选择应用类型（R2MO/Spring 或 ZERO/Vertx）
3. 使用 `mxt domain -d <dir>` 处理领域模型

### 提示词使用流程
1. 使用 `mxt ask` 从模板目录选择提示词
2. 提示词会自动复制到剪切板
3. 在 AI 工具中粘贴使用

### AI 工具集成流程
1. 使用 `mxt open [-d <dir>]` 打开项目到指定的 AI 工具
2. 支持的工具：Antigravity、Trae、Cursor
3. 使用 `mxt mcp` 配置 Cursor 的 MCP 服务器

## 提示词规范

1. 所有提示词模板存储在 `src/_template/R2MO/` 目录中
2. 使用 `mxt ask` 命令可以快速选择和复制提示词
3. 提示词模板使用 front-matter 格式，包含 `title` 和 `version` 字段
4. 提示词内容位于 `--- BEGIN` 和 `--- END` 标记之间

## 注意事项

1. 请勿直接修改 `specification/changes/` 目录下的文件，应通过规范流程进行管理
2. 所有需求变更应遵循 OpenSpec 标准流程
3. 归档的需求存储在 `specification/.archives/` 目录中，可通过时间戳识别
4. 不同 AI 工具应使用对应的技能目录进行配置
5. `mxt domain` 命令要求目标目录必须是有效的 Maven 项目，且包含必需的子模块
6. `mxt app` 命令会检查目标目录是否已存在，避免覆盖现有项目
7. 远程仓库缓存存储在 `.r2mo/repo` 目录中，已自动添加到 `.gitignore`

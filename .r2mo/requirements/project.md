---
name: "{项目名称}"
brief: "{项目一句话简介}"
version: "1.0.0"
author: "{作者/团队名称}"
date: "{YYYY-MM-DD}"
---

# Project Context

## Purpose
- {描述项目旨在解决的核心痛点或业务问题}
- {列出项目的核心价值主张或愿景}
- {定义项目成功的关键衡量指标 (KPIs) 或验收标准}

## Tech Stack
- {前端核心框架及版本，例如：React 18, Vue 3}
- {后端语言及框架，例如：Node.js (NestJS), Python (FastAPI)}
- {数据库及存储方案，例如：PostgreSQL, Redis}
- {基础设施与构建工具，例如：Docker, K8s, Vite}

## Project Conventions

### Code Style
- {命名约定，例如：变量驼峰法、常量全大写、组件帕斯卡命名}
- {格式化工具配置，例如：Prettier 规则、ESLint 严格模式}
- {文件目录结构规范，例如：按功能模块划分 vs 按技术类型划分}

### Architecture Patterns
- {整体架构风格，例如：Monorepo, 微服务, 模块化单体}
- {设计模式应用，例如：DDD (领域驱动设计), MVC, MVVM}
- {状态管理策略，例如：Redux Toolkit, Pinia, Context API}
- {API 设计规范，例如：RESTful, GraphQL}

### Testing Strategy
- {单元测试要求，例如：Jest, 覆盖率 > 80%}
- {集成测试范围，例如：关键 API 链路测试}
- {E2E 测试工具，例如：Cypress, Playwright}
- {Mock 数据处理规范}

### Git Workflow
- {分支策略，例如：Gitflow, Trunk-based development}
- {Commit 信息规范，例如：遵循 Conventional Commits (feat/fix/chore)}
- {Pull Request 流程，例如：必须包含截图、至少 1 人 Review}

## Domain Context
- {核心术语表 (Glossary)，解释特定的业务名词}
- {用户角色定义 (Personas)，例如：管理员、普通用户、审计员}
- {关键业务流程逻辑，例如：订单状态流转图、审批流逻辑}

## Important Constraints
- {性能指标，例如：首屏加载 < 1.5s, API 响应 < 200ms}
- {浏览器/设备兼容性要求，例如：支持 Mobile First, iOS Safari}
- {数据隐私与合规，例如：GDPR, 数据脱敏规则}
- {硬性交付截止日期 (Deadlines) 或预算限制}

## External Dependencies
- {第三方服务集成，例如：Stripe 支付, 阿里云 OSS, Google Maps API}
- {内部依赖系统，例如：SSO 登录中心, 遗留 ERP 系统}
- {特定环境或硬件依赖}
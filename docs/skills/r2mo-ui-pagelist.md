# r2mo-ui-pagelist

## 基本介绍

列表、表格、搜索、分页和行操作。

- Skill 标题：Role: Frontend — List and Table
- 版本：7.0.0
- 描述：Frontend: Data tables, list views, and search filters from R2MO specs.

## 适用场景

- 页面以查询和列表展示为主。
- 需要把 schema/API 转成表格列、筛选项和操作列。

## 主要输出

- 查询表单、数据表格、分页、批量操作和行操作。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-pagelist/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-pagelist/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-pagelist/SKILL.md
```

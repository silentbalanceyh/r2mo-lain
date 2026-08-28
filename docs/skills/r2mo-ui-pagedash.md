# r2mo-ui-pagedash

## 基本介绍

Dashboard、指标卡片、图表和数据概览。

- Skill 标题：Role: Frontend — Dashboard and Widgets
- 版本：7.0.0
- 描述：Frontend: Dashboard and data visualization panels from R2MO specs.

## 适用场景

- 页面以 widgets / api_refs / filters 为主。
- 需要把聚合数据做成可视化看板。

## 主要输出

- KPI 卡、图表容器、筛选联动和看板布局。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-pagedash/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-pagedash/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-pagedash/SKILL.md
```

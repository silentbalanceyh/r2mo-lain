# r2mo-ui-route

## 基本介绍

路由树、守卫、页面元数据和菜单投影。

- Skill 标题：Role: Frontend — Route and Guards
- 版本：7.0.0
- 描述：Frontend: Route tree, guards, and navigation topology from R2MO specs.

## 适用场景

- 需要把 design.page / requirement.module 变成路由配置。
- 需要认证、权限、404/403、标题和面包屑规则。

## 主要输出

- routes、guards、menu projection 和路由元数据。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-route/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-route/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-route/SKILL.md
```

# r2mo-ui-admin

## 基本介绍

应用外壳、全局布局、导航和主题引擎。

- Skill 标题：Role: Frontend — Application Shell and Navigation
- 版本：7.0.0
- 描述：Frontend: Application shell, layout, navigation, and theme engine for R2MO specs.

## 适用场景

- 需要生成后台 Shell / Layout。
- 需要根据 requirement.module / design.system 生成菜单、主题、Header、Sidebar。

## 主要输出

- 布局组件、导航数据消费、主题变量和响应式外壳。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-admin/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-admin/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-admin/SKILL.md
```

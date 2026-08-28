# r2mo-ui-tree

## 基本介绍

树、层级视图、树选择器和 tree-table 规则。

- Skill 标题：Role: Frontend — Tree and Hierarchy
- 版本：1.0.0
- 描述：Frontend: Tree and hierarchy views, tree selectors, and tree-table from R2MO specs.

## 适用场景

- schema 或页面规格包含 parent/children/tree_key。
- 需要层级选择、懒加载、勾选或级联。

## 主要输出

- 树组件绑定、懒加载规则、选择状态和层级 API 映射。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-tree/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-tree/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-tree/SKILL.md
```

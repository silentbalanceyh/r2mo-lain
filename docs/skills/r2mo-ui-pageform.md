# r2mo-ui-pageform

## 基本介绍

表单、字段布局、校验和提交流程。

- Skill 标题：Role: Frontend — Form and Validation
- 版本：7.0.0
- 描述：Frontend: Forms, validation, and submission flows from R2MO specs.

## 适用场景

- 页面用于新增、编辑、详情或审批输入。
- front-matter 存在 bind / mode / actions / validation。

## 主要输出

- 表单视图、字段组件映射、校验规则和提交状态。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-pageform/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-pageform/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-pageform/SKILL.md
```

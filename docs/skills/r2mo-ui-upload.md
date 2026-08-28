# r2mo-ui-upload

## 基本介绍

文件/图片上传、预览、裁剪和媒体绑定。

- Skill 标题：Role: Frontend — Upload and Media
- 版本：1.0.0
- 描述：Frontend: File and image upload, preview, and media binding from R2MO specs.

## 适用场景

- 字段类型或规格包含 file/image/accept/max_size/crop。
- 表单或列表中需要上传控件和预览规则。

## 主要输出

- 上传控件、进度/错误状态、预览裁剪和上传 API 映射。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-upload/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-upload/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-upload/SKILL.md
```

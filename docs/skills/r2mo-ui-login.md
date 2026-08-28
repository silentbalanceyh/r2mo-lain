# r2mo-ui-login

## 基本介绍

登录、SSO、找回密码等入口认证体验。

- Skill 标题：Role: Frontend — Entry and Auth
- 版本：5.0.0
- 描述：Frontend: Entry and auth experience (login, SSO, recovery) driven by R2MO specs.

## 适用场景

- 需要生成登录页或入口页。
- 需要连接认证 API、token 存储、登录成功跳转。

## 主要输出

- 入口视图、auth store、表单校验和登录交互。

## 使用边界

- 该 Skill 是 AI 生成/实现前的约束文档，不是直接执行的 Node CLI 子命令。
- 使用时应先读取项目规格文档的 front-matter，不要依赖固定文件名或硬编码页面名称。
- 与其他 UI Skill 协作时，只负责自己边界内的组件/规则，跨边界内容应交给对应 Skill。

## 源头

- Skill 源文件：`docs/skills/r2mo-ui-login/SKILL.md`

## 命令执行记录

```bash
# 查看 Skill 源头
test -f docs/skills/r2mo-ui-login/SKILL.md && sed -n '1,80p' docs/skills/r2mo-ui-login/SKILL.md
```

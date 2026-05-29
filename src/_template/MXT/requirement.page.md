---
# ==============================================================================
# 📄 Page Metadata / 页面元数据
# ==============================================================================
identifier: "requirement.page"     # 规范ID
id: "PAGE_{MODULE}_{NAME}"         # 页面唯一ID，如：PAGE_SYS_USER_LIST
module_id: "{MODULE_ID}"           # 所属模块ID，如：MOD_SYS_ADMIN
name: "{页面中文名称}"              # 页面名称
code: "{page-code}"                # 页面代号/文件名，如：user-list
author: "{author}"                 # 负责人
createdAt: "YYYY-MM-DD HH:mm"      # 创建时间
updatedAt: "YYYY-MM-DD HH:mm"      # 更新时间
version: "1.0.0"                   # 页面版本
change_history: []                 # 变更历史（用于1-1.1迭代检测）

# 🖥️ View Configuration
route: "/{module}/{page}"          # 页面路由规则，如：/sys-admin/user-list
component_name: "{ComponentName}"  # 组件名称，如：UserList
layout: "{LayoutName}"             # 布局容器，如：DefaultLayout
keep_alive: false                  # 是否缓存
permissions: []                    # 页面级权限码，如：["sys:user:view"]
page_type: "list|form|detail|dashboard"  # 页面类型
---

## 1. 页面概述

{页面功能简述，100-200字}

## 2. 核心功能

- **{功能1}**: {功能描述}
- **{功能2}**: {功能描述}

## 3. 数据模型

- **主实体**: `{EntityName}` - {实体说明}
- **关联实体**: `{Related1}`, `{Related2}`
- **数据字典**: `{Dict1}`, `{Dict2}`

## 4. API操作

| 操作类型 | 操作说明 | 数据流 | 触发时机 |
|---------|---------|--------|---------|
| {操作1} | {操作的业务描述，如：加载用户列表} | Request → Response | {页面加载时/按钮点击时} |
| {操作2} | {操作的业务描述，如：提交表单创建用户} | FormData → Result | {表单提交时} |
| {操作3} | {操作的业务描述，如：更新用户信息} | FormData → Result | {保存按钮点击时} |
| {操作4} | {操作的业务描述，如：删除用户} | UserId → Result | {删除确认后} |

> **注**: 具体API端点从 `api.yaml` 或 `.r2mo/api/metadata.yaml` 中获取，按页面功能匹配

## 5. 页面组件

| 组件 | 类型 | 说明 |
|------|------|------|
| {Component1} | Header | {组件说明} |
| {Component2} | SearchBar | {组件说明} |
| {Component3} | Table/Form | {组件说明} |

## 6. 表单字段

| 字段名 | 类型 | 验证规则 | 必填 | 说明 |
|-------|------|---------|------|------|
| {field1} | text | 长度1-64 | 是 | {字段说明} |
| {field2} | select | 枚举值 | 是 | {字段说明} |
| {field3} | date | 日期格式 | 否 | {字段说明} |

## 7. 权限控制

| 操作/元素 | {Role1} | {Role2} | {Role3} | 说明 |
|----------|---------|---------|---------|------|
| {操作1} | ✓/✗ | ✓/✗ | ✓/✗ | {权限说明} |
| {操作2} | ✓/✗ | ✓/✗ | ✓/✗ | {权限说明} |
| {操作3} | ✓/✗ | ✓/✗ | ✓/✗ | {权限说明} |

## 8. 生命周期钩子

### INIT (初始化)
- {初始化操作1}
- {初始化操作2}

### QUERY (查询)
- {查询操作1}
- {查询操作2}

### ACTION (操作)
- {操作1}
- {操作2}

### VALIDATE (验证)
- {验证规则1}
- {验证规则2}

### EVENT (事件)
- {事件处理1}
- {事件处理2}

### CLEANUP (清理)
- {清理操作1}
- {清理操作2}

---
name: r2-req-page
description: Extract page requirements from module specifications
version: 2.0.0
tags: [r2mo, requirement, page, analysis]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-req-page

Extract page-level requirements from module context and generate specification documents.

## Role
Requirement Analyst - Extract and document page requirements only.

## Input
- `requirement.module.md` - Module requirements (primary)
- `metadata.yaml` - Module configuration
- `{PROJECT_ROOT}/.r2mo/api/metadata.yaml` - API definitions
- `{PROJECT_ROOT}/.r2mo/api/operations/**/*.md` - API operations
- `{PROJECT_ROOT}/.r2mo/api/components/schemas/*.md` - Data models
- `{PROJECT_ROOT}/.r2mo/design/spec.md` - UI/UX specs (optional)
- `{PROJECT_ROOT}/.r2mo/api/marker.md` - Validation rules (optional)

## Output
- `requirement.page.md` - Page requirements (Chinese content)
- `page.yaml` - Page lifecycle configuration

## Template
- `{TEMPLATE_ROOT}/requirement.page.md` - Follow structure exactly
- `{TEMPLATE_ROOT}/page.yaml` - Lifecycle template

**Note**: `{TEMPLATE_ROOT}` resolves from template repository or project setup

## Process

### 1. Read Module Context
```
Read: requirement.module.md
Extract: Page-related sections (Section 6: 页面清单)
Identify: Page type (list/form/detail/dashboard)
```

### 2. Filter Page APIs
```
Read: {PROJECT_ROOT}/.r2mo/api/operations/**/*.md
Filter: APIs for current page
Categorize: Query (GET), Mutation (POST/PUT/DELETE), Special
```

### 3. Extract Page Data Models
```
Parse: {PROJECT_ROOT}/.r2mo/api/components/schemas/*.md
Filter: Page-relevant entities only
Extract: Fields, types, constraints
```

### 4. Generate requirement.page.md
```
Template: {TEMPLATE_ROOT}/requirement.page.md
Structure: 8 sections (页面概述, 核心功能, 数据模型, API操作, 页面组件, 表单字段, 权限控制, 生命周期钩子)
Language: Simplified Chinese for content
Format: Follow template exactly
```

**YAML Header**:
```yaml
identifier: "requirement.page"
id: "PAGE_{MODULE}_{NAME}"
module_id: "{MODULE_ID}"
name: "{页面中文名称}"
code: "{page-code}"
author: "{author}"
createdAt: "YYYY-MM-DD HH:mm"
updatedAt: "YYYY-MM-DD HH:mm"
version: "1.0.0"
change_history: []
route: "/{module}/{page}"
component_name: "{ComponentName}"
layout: "{LayoutName}"
keep_alive: false
permissions: []
page_type: "list|form|detail|dashboard"
```

**Content Sections** (Extract from context):
- **Section 1**: Page overview (100-200 chars from module requirements)
- **Section 2**: Page functions (2-4 items from page purpose)
- **Section 3**: Data models (Primary entity + related)
- **Section 4**: API operations (Table from operations/*.md)
- **Section 5**: Page components (Table: Header, SearchBar, Table/Form)
- **Section 6**: Form fields (Table from schemas with validation)
- **Section 7**: Permissions (Role-operation matrix)
- **Section 8**: Lifecycle (6 phases: INIT/QUERY/ACTION/VALIDATE/EVENT/CLEANUP)

### 5. Generate page.yaml
```
Template: {TEMPLATE_ROOT}/page.yaml
Sections: metadata, skills, dict, layout, lifecycle
Format: Keep comment headers
```

**Configuration**:
```yaml
metadata:
  name: "{page-name}"
  title: "{页面标题}"
  type: "list|form|detail|dashboard"
  route: "/{module}/{page}"
  authorized: true
skills: [{page-skills}]
dict: [{data-dicts}]
layout: [{components-config}]
lifecycle:
  init: [check-permission, load-data, load-dict]
  query: [validate-query, execute-search, render-results]
  action: [{CRUD operations with api/method}]
  validate: [field-validation, business-rules]
  event: [{user-interactions}]
  cleanup: [cancel-requests, clear-listeners]
```

## Rules
1. **Extract only** - From requirement.module.md and .r2mo context
2. **Follow template** - Use exact structure from {TEMPLATE_ROOT}
3. **Chinese content** - All requirement text in Simplified Chinese
4. **Page scope** - Single business concern, no module/implementation details
5. **Lifecycle** - All 6 phases must be defined

## Validation
- [ ] 8 sections complete in requirement.page.md
- [ ] YAML header valid
- [ ] API operations from .r2mo/api/operations
- [ ] Form fields from .r2mo/api/components/schemas
- [ ] page.yaml has 6 lifecycle phases
- [ ] All paths valid
- [ ] Content in Chinese (except YAML keys)

## Context Paths Reference
```
Module Directory: {module-dir}
├── requirement.module.md            ← Primary input
├── metadata.yaml                    ← Module config
│
Page Directory: {page-dir}
├── requirement.page.md              ← Output 1
└── page.yaml                        ← Output 2
│
Project Root: {PROJECT_ROOT}/.r2mo/
├── api/
│   ├── metadata.yaml               ← API structure
│   ├── operations/**/*.md          ← API endpoints
│   ├── components/schemas/*.md     ← Data models
│   └── marker.md                   ← Validation rules
└── design/spec.md                  ← UI/UX specs (optional)
```

## Success Criteria
- requirement.page.md: 8 sections, Chinese content, follows template
- page.yaml: 6 lifecycle phases, valid YAML
- All content extracted from module requirements and .r2mo context
- Ready for r2-dev-page skill

---
name: r2-req-module
description: Extract module requirements from project specifications
version: 2.1.0
tags: [r2mo, requirement, module, analysis, specification]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-req-module

Extract module-level requirements from project context and generate specification documents that strictly follow the template structure.

## Role
Requirement Analyst - Extract and document module requirements following template constraints.

## Input
- `{PROJECT_ROOT}/.r2mo/requirements/project.md` - Project requirements (READ-ONLY)
- `{PROJECT_ROOT}/.r2mo/requirements/project-module.md` - Module requirement template (READ-ONLY reference)
- `{PROJECT_ROOT}/.r2mo/api/metadata.yaml` - API definitions
- `{PROJECT_ROOT}/.r2mo/api/operations/**/*.md` - API operations
- `{PROJECT_ROOT}/.r2mo/api/components/schemas/*.md` - Data models
- `{PROJECT_ROOT}/.r2mo/domain/*.proto` - Domain models (optional)
- `{PROJECT_ROOT}/.r2mo/design/spec.md` - Design specs (optional)
- `{PROJECT_ROOT}/.r2mo/api/marker.md` - Validation rules (optional)

## Output
- `src/pages/{module}/requirement.module.md` - Module requirement specification (Chinese content)
- `src/pages/{module}/metadata.yaml` - Module configuration

## Template Reference
- `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md` - Mandatory format structure (MUST follow exactly)
- `{TEMPLATE_ROOT}/requirement.module.md` - Content structure template
- `{TEMPLATE_ROOT}/metadata.yaml` - Configuration template

**Note**: `{TEMPLATE_ROOT}` resolves from template repository or project setup

## ⚠️ Critical Rules (Ironclad Constraints)

### Rule 1: Read-Only Original Requirements
- `.r2mo/requirements/` contains **original source requirements** - strictly read-only
- AI **ABSOLUTELY PROHIBITED** from writing or modifying any files in `.r2mo/requirements/`
- These files are manually maintained by project managers and are the definitive data source
- Use them ONLY as reference input, never as output destination

### Rule 2: Fixed Output Directory
- **SOLE output directory**: `src/pages/{module}/`
- Must generate exactly two files:
  - `src/pages/{module}/requirement.module.md` - Module requirement document
  - `src/pages/{module}/metadata.yaml` - Module configuration file
- **FORBIDDEN**: Writing to `.r2mo/` directory structure
- All outputs must be in the specified module directory

### Rule 3: Strict Template Format Compliance
- `requirement.module.md` **MUST** follow exact structure from `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md`
- YAML header format is mandatory - all required fields must be present
- Required YAML fields: `identifier`, `id`, `name`, `code`, `version`, `owner`, `createdAt`, `updatedAt`, `route`, `store`, `i18n`
- Content sections must follow template sections exactly - **NO additional sections allowed**
- Template-defined sections ONLY:
  1. **Scope** section with Boundary, Structure, and State Management subsections
  2. **UI Specification** section with Layout, Components, and i18n subsections
  3. **Business Flow** section with Workflow Graph subsections

## Process

### 1. Read Context
```
Input: {PROJECT_ROOT}/.r2mo/requirements/project.md
Action: Read and extract module-related sections
Identify: Business objectives, core functions, scope boundaries
Note: This is READ-ONLY source - extract only, do not modify
```

### 2. Collect API Information
```
Input: {PROJECT_ROOT}/.r2mo/api/metadata.yaml
Input: {PROJECT_ROOT}/.r2mo/api/operations/**/*.md
Action: Scan for module-related API endpoints
Categorize: Group by CRUD operations and special operations
Filter: Extract only module-relevant endpoints
```

### 3. Analyze Data Models
```
Input: {PROJECT_ROOT}/.r2mo/api/components/schemas/*.md
Input: {PROJECT_ROOT}/.r2mo/domain/*.proto (if available)
Action: Parse entities and field definitions
Extract: Data structures, constraints, relationships
Filter: Module-relevant models only
```

### 4. Generate requirement.module.md
```
Output Path: src/pages/{module}/requirement.module.md (FIXED - REQUIRED)
Template Source: {TEMPLATE_ROOT}/SPEC/requirements/project-module.md
Language: Chinese for all content (English only in YAML keys)
Validation: MUST strictly follow template structure - NO NEW SECTIONS ALLOWED
```

**YAML Header (MANDATORY Structure)**:
Reference: `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md`
```yaml
---
# Module Metadata / 模块元数据
identifier: "requirement.module"              # Fixed identifier
id: "MOD_{CATEGORY}_{NAME}"                  # Extract from .r2mo/requirements/project-module.md
name: "{Module Name in Chinese}"             # Extract from source
code: "{module-code}"                        # Extract from source
version: "1.0.0"                             # Extract from source
owner: "{owner}"                             # Extract from source
createdAt: "YYYY-MM-DD HH:mm"                # Current timestamp
updatedAt: "YYYY-MM-DD HH:mm"                # Current timestamp

# UI Framework Configuration
route: "/{module-route}"                     # Extract from source
store: "use{ModuleName}Store"                # Extract from source (PascalCase)
i18n: "{module-i18n}"                        # Extract from source
---
```

**Content Structure (Mandatory Sections ONLY)**:

⚠️ **CRITICAL**: Follow template sections exactly. Do NOT add new sections beyond template.

**Section 1: Scope**
- Subsection 1.1: Boundary (In Scope / Out Scope)
- Subsection 1.2: Structure (Entry / Sub Modules)
- Subsection 1.3: State Management

**Section 2: UI Specification**
- Subsection 2.1: Layout (Template / Interaction Pattern / Responsive Rules)
- Subsection 2.2: Components (Complex Widgets / Visual Elements)
- Subsection 2.3: i18n (Namespace / Requirements)

**Section 3: Business Flow**
- Subsection 3.1: Workflow Graph (Use Mermaid or narrative)
- Subsections 3.2+: Individual workflow definitions (Workflow-01, Workflow-02, etc.)

**Data Population Rules**:
- All values extracted from `.r2mo/requirements/project-module.md`
- Do NOT fabricate content
- Use actual API endpoints from `.r2mo/api/operations/`
- Reference actual data models from `.r2mo/api/components/schemas/`

### 5. Generate metadata.yaml
```
Output Path: src/pages/{module}/metadata.yaml (FIXED - REQUIRED)
Template Source: {TEMPLATE_ROOT}/metadata.yaml
Sections: @SKILLS, @REQ, @PAGE, @API, @DESIGN, @MODEL
Format: Preserve comment headers and structure
```

**Configuration Structure**:
```yaml
# @SKILLS - Module-level skills required for implementation
skills: [...]

# @REQ - Requirement document references
rule-requirement:
  app: ".r2mo/requirements/project.md"
  module: "requirement.module.md"

# @PAGE - UI pages to be generated
pages: [...]

# @API - API endpoints and schemas
api:
  source: ".r2mo/api/metadata.yaml"
  extracted: "api.yaml"
  match: ["{module-prefix}"]

# @DESIGN - UI/UX design specifications
design:
  app: ".r2mo/design/spec.md"
  module: "design.md"

# @MODEL - Data models and schemas
schema:
  store: [".r2mo/api/components/schemas/{module}-*.md", ".r2mo/domain/{module}*.proto"]
  match: ["{module}"]
  marker: ".r2mo/api/marker.md"
```

## ⚠️ Critical Format Constraint

### Strict Template Compliance - NO NEW SECTIONS ALLOWED

The final module requirement document **MUST** adhere strictly to the template structure defined in `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md`. This is a non-negotiable constraint:

**Allowed Sections (3 ONLY)**:
1. **Scope** section
   - Boundary subsection
   - Structure subsection
   - State Management subsection

2. **UI Specification** section
   - Layout subsection
   - Components subsection
   - i18n subsection

3. **Business Flow** section
   - Workflow Graph subsection
   - Individual workflow definitions (Workflow-01, Workflow-02, etc.)

**PROHIBITED Actions**:
- ❌ Adding any section beyond the three listed above
- ❌ Adding extra chapters like "Requirements Analysis", "Technical Specifications", "Implementation Guide", etc.
- ❌ Modifying subsection names or structure
- ❌ Reorganizing sections
- ❌ Adding preamble or conclusion sections

**Rationale**:
The template is the contract between requirement analysts and developers. Any deviation breaks the consistency and causes integration failures with downstream processes (r2-req-page, design, implementation).

**Validation**:
Before finalizing the output, verify that:
1. Only the three main sections exist
2. Each section contains only its defined subsections
3. No additional content appears outside these sections
4. YAML header contains exactly the required fields
5. All content is extracted from `.r2mo/` context files

## Rules

### ⚠️ Mandatory Rules (Must Enforce Strictly)

1. **Read-Only Constraint on `.r2mo/requirements/` Directory**
   - NEVER write or modify any files in `.r2mo/requirements/`
   - These are original source documents managed by project stakeholders
   - Extract and reference only - modification is strictly prohibited

2. **Fixed Output Directory Requirement**
   - ALL outputs MUST go to `src/pages/{module}/`
   - Exactly two files must be generated:
     - `requirement.module.md`
     - `metadata.yaml`
   - No output to any other directory, especially NOT `.r2mo/`

3. **Strict Template Format Compliance (CRITICAL)**
   - `requirement.module.md` MUST follow `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md` structure exactly
   - Only three main sections allowed:
     - **Scope** (with 3 subsections: Boundary, Structure, State Management)
     - **UI Specification** (with 3 subsections: Layout, Components, i18n)
     - **Business Flow** (with Workflow Graph and individual workflows)
   - **NO additional sections permitted** - Violates template contract
   - All content must be extracted from `.r2mo/` context files

4. **Content Extraction Rules**
   - Extract only from official sources (`.r2mo/requirements/`, `.r2mo/api/`, `.r2mo/domain/`)
   - Do NOT fabricate, invent, or assume content
   - All text must be in Simplified Chinese (except YAML keys which are English)
   - Maintain traceability - every content item should reference source

5. **YAML Header Integrity**
   - All required fields must be present: `identifier`, `id`, `name`, `code`, `version`, `owner`, `createdAt`, `updatedAt`, `route`, `store`, `i18n`
   - Values must be extracted from `.r2mo/requirements/project-module.md`
   - No placeholder values in final output

6. **Module-Level Scope Only**
   - Focus on module requirements, not project-level concerns
   - Extract only module-relevant API endpoints and data models
   - Do not include implementation details or technical stack specifications

7. **Template Traceability**
   - Every section in output must map to template
   - Preserve comment markers from template where applicable
   - Maintain template-defined subsection structure

## Validation Checklist

### Format Validation
- [ ] Requirement file path: `src/pages/{module}/requirement.module.md` (exact location)
- [ ] Configuration file path: `src/pages/{module}/metadata.yaml` (exact location)
- [ ] YAML header present and valid with all required fields
- [ ] No files written to `.r2mo/requirements/` directory
- [ ] No files written to any directory outside `src/pages/{module}/`

### Content Structure Validation
- [ ] ONLY three main sections present: Scope, UI Specification, Business Flow
- [ ] **NO additional sections** beyond template (e.g., no extra chapters)
- [ ] Scope section contains exactly 3 subsections: Boundary, Structure, State Management
- [ ] UI Specification section contains exactly 3 subsections: Layout, Components, i18n
- [ ] Business Flow section contains Workflow Graph and workflow definitions
- [ ] All section headers match template exactly

### Content Quality Validation
- [ ] All text in Simplified Chinese (except YAML keys)
- [ ] All content extracted from `.r2mo/` context files (no fabrication)
- [ ] YAML values extracted from source, not fabricated
- [ ] API endpoints reference actual files from `.r2mo/api/operations/`
- [ ] Data models reference actual files from `.r2mo/api/components/schemas/`
- [ ] No project-level details, module scope only
- [ ] Traceable - content can be verified against source

### Metadata Validation
- [ ] metadata.yaml has 6 sections: @SKILLS, @REQ, @PAGE, @API, @DESIGN, @MODEL
- [ ] All paths in metadata.yaml are valid
- [ ] Comment headers preserved
- [ ] Valid YAML syntax

## Context Paths Reference

```
Project Root: {PROJECT_ROOT}
├── .r2mo/
│   ├── requirements/
│   │   ├── project.md                   ← Primary input (READ-ONLY)
│   │   └── project-module.md            ← Template reference (READ-ONLY)
│   ├── api/
│   │   ├── metadata.yaml                ← API structure
│   │   ├── operations/**/*.md           ← API endpoints
│   │   ├── components/schemas/*.md      ← Data models
│   │   └── marker.md                    ← Validation rules
│   ├── domain/*.proto                   ← Domain models (optional)
│   └── design/spec.md                   ← UI/UX specs (optional)
│
Template Root: {TEMPLATE_ROOT}
├── SPEC/requirements/
│   └── project-module.md                ← Format structure (REFERENCE ONLY)
├── requirement.module.md                ← Content template
└── metadata.yaml                        ← Configuration template
│
Module Output Directory: src/pages/{module}/ (SOLE OUTPUT LOCATION)
├── requirement.module.md                ← Generated output
└── metadata.yaml                        ← Generated output
```

## Success Criteria

- ✅ requirement.module.md: Three sections only (Scope, UI Specification, Business Flow)
- ✅ YAML header: All required fields present and extracted from source
- ✅ Content: All in Simplified Chinese, fully extracted from `.r2mo/` context
- ✅ Format: Exact match to `{TEMPLATE_ROOT}/SPEC/requirements/project-module.md` structure
- ✅ metadata.yaml: Six sections present with valid YAML syntax
- ✅ Output location: Only `src/pages/{module}/` directory
- ✅ No modifications: `.r2mo/requirements/` remains untouched
- ✅ Traceability: All content verifiable against source files
- ✅ Ready for: r2-req-page skill execution

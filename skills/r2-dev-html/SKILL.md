---
name: r2-dev-html
description: Generate HTML layout and design mockups from page specifications with draft support
version: 1.0.0
tags: [r2mo, dev, html, design, frontend, mockup, wireframe]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-dev-html

Generate HTML layout files and visual design mockups from page specifications. Supports design drafts for iterative design workflow.

## Role
Frontend UI Designer - Generate production-ready HTML layouts, Tailwind CSS styling, and visual mockups.

## Scope

### ✅ In Scope
- HTML layout and structure based on page specifications
- Tailwind CSS styling and responsive design
- UI component markup (forms, tables, modals, etc.)
- Visual mockups and wireframes
- Accessibility (ARIA labels, semantic HTML)
- Interactive elements and state visualization
- Design drafts handling and enhancement

### ❌ Not in Scope
- Backend API implementation
- Database schema design
- Server-side logic
- API route handlers
- Authentication/authorization logic
- Performance optimization (build/bundling)

## Input Hierarchy (Priority Order)

### Primary Input (Page Specification)
- `{MODULE_PATH}/requirement.page.md` - Page requirements specification
  - Section 1: Context (Goal, User, Parameters)
  - Section 2: Data Model (Props, Local State, Computed State)
  - Section 3: Lifecycle & Logic (Initialization, Updates, Destruction)
  - Section 4: UI Specification (Structure, View States)
  - Section 5: API Integration (Endpoints, Data Mapping)

- `{MODULE_PATH}/page.yaml` - Page lifecycle configuration
  - @METADATA: Page metadata
  - @DICT: Required dictionaries
  - @LAYOUT: Layout component structure
  - @LIFECYCLE: Lifecycle phases (init, action, validate, event, cleanup)

### Design Blueprint (If Exists)
- **Draft Design** (Priority High): `.r2mo/design/draft/{page_id}/*.html`
  - Use as template/reference for styling and layout
  - Enhance with components and responsive behavior
  - Keep design intent from draft

- **Page Design Spec** (Priority Medium): `.r2mo/design/page/{page_id}/spec.md`
  - Design guidelines and component specifications
  - Color schemes, typography, spacing rules
  - Component variants and states

- **System Design Spec** (Priority High): `{PROJECT_ROOT}/.r2mo/design/spec.md` ⭐ **MANDATORY**
  - Global design system and standards
  - Tailwind CSS color palette and tokens
  - Typography scale and font definitions
  - Spacing, breakpoints, and layout rules
  - Component primitives and utility mappings
  - This is the source of truth for all design decisions

### Supporting Context
- `{MODULE_PATH}/requirement.module.md` - Module context
- `{MODULE_PATH}/metadata.yaml` - Module configuration
- `{PROJECT_ROOT}/.r2mo/requirements/project.md` - Project tech stack and standards
- `{PROJECT_ROOT}/.r2mo/design/spec.md` - Global design system
- `{PROJECT_ROOT}/.r2mo/api/marker.md` - Validation rules and field markers

## Output Location and Files

### Output Directory (Fixed)
```
src/pages/{module}/{page}/html/
```

### Output Files (EXACTLY 3)

#### 1. Layout File
**Path**: `src/pages/{module}/{page}/html/layout.html`
**Purpose**: Core HTML structure and layout

**Structure**:
```html
<!-- Metadata and Configuration -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <!-- Tailwind CSS inline or linked -->
  <style>
    /* Tailwind utilities and custom styles */
  </style>
</head>

<!-- Page Layout -->
<body>
  <!-- Header/Navigation (if applicable) -->
  <!-- Main Content Area (per UI Specification → Structure) -->
  <!-- Sidebar (if applicable) -->
  <!-- Footer (if applicable) -->
  <!-- Modals and Overlays -->
</body>
</html>
```

**Content Rules**:
- Use semantic HTML5 tags (`<main>`, `<section>`, `<article>`, `<aside>`, etc.)
- Implement layout from `requirement.page.md` Section 4: UI Specification → Structure
- Use Tailwind CSS utility classes for styling
- Include ARIA labels for accessibility
- Support all View States from `requirement.page.md` Section 4: View States (Loading, Empty, Error)
- Use data attributes for state visualization: `data-state="loading"`, `data-state="empty"`, `data-state="error"`
- Responsive design: mobile-first approach with Tailwind breakpoints

#### 2. Components File
**Path**: `src/pages/{module}/{page}/html/components.html`
**Purpose**: Reusable component snippets and variations

**Structure**:
```html
<!-- Component Library for this Page -->

<!-- Form Component -->
<template id="form-component">
  <!-- Form fields, validation states, error messages -->
</template>

<!-- Table Component -->
<template id="table-component">
  <!-- Table structure, sorting, pagination -->
</template>

<!-- Modal Component -->
<template id="modal-component">
  <!-- Modal header, body, footer, close button -->
</template>

<!-- Loading Skeleton -->
<template id="loading-skeleton">
  <!-- Skeleton loaders for different elements -->
</template>

<!-- Empty State -->
<template id="empty-state">
  <!-- Empty state message and illustration -->
</template>

<!-- Error State -->
<template id="error-state">
  <!-- Error message and recovery actions -->
</template>

<!-- Additional Components -->
<!-- Based on page.yaml @LAYOUT configuration -->
```

**Component Rules**:
- Use `<template>` tags for reusable components
- Include all state variants (default, loading, disabled, error, success)
- Document component props and usage in HTML comments
- Reference design dictionary values (color, spacing, typography) from system design
- Include accessibility attributes

#### 3. Mockup File
**Path**: `src/pages/{module}/{page}/html/mockup.html`
**Purpose**: Visual mockup with sample data and interactions

**Structure**:
```html
<!-- Complete Page Mockup with Sample Data -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Mockup</title>
  <style>
    /* Full Tailwind CSS with custom utilities */
  </style>
</head>

<body>
  <!-- Complete rendered page with sample data -->
  <!-- All states visualized: loading, empty, error, success -->
  <!-- Interactive elements with basic JS for state switching -->
</body>

<script>
  // Basic state management for mockup visualization
  // Switch between different view states
  // Show/hide components based on data
</script>
</html>
```

**Mockup Rules**:
- Include all possible UI states (loading, success, empty, error)
- Use sample/mock data that represents real data
- Implement basic interactivity (state switching, form inputs)
- Use inline CSS with Tailwind utilities
- Support all breakpoints (mobile, tablet, desktop)
- Include comments explaining each section and state

## Tailwind CSS Integration & Design System Reference

### ⭐ CRITICAL: Design System Compliance

**Every HTML file MUST reference the project's design specifications before generation:**

```
Read: {PROJECT_ROOT}/.r2mo/design/spec.md
Apply: All design tokens, color palettes, typography, spacing
Implement: Use Tailwind CSS utility classes following design system rules
```

### Design System Structure in spec.md

The design specification file defines:

```
1. Color Palette
   └─ Brand colors (primary-50 to primary-900)
   └─ Neutral colors (gray, white backgrounds)
   └─ Semantic colors (success, warning, error, info)
   └─ Mapping to Tailwind utility classes (bg-primary-600, text-gray-500, etc.)

2. Typography
   └─ Type scale (text-xs, text-sm, text-base, text-lg, text-xl, text-2xl)
   └─ Font families (font-sans, font-mono)
   └─ Font weights and line heights
   └─ Usage recommendations for each level

3. Layout & Spacing
   └─ Breakpoints (sm, md, lg, xl, 2xl)
   └─ Container configuration with padding
   └─ Spacing scale (gap, p, m, etc.)
   └─ Mobile-first approach

4. Borders & Effects
   └─ Border radius (rounded-sm, rounded-md, rounded-lg, rounded-full)
   └─ Box shadows (shadow-sm, shadow, shadow-md, shadow-xl)
   └─ Elevation levels

5. Component Primitives
   └─ Button styles (Primary, Secondary, Ghost)
   └─ Form input styles
   └─ Badge/Chip styles
   └─ @apply directives for component combinations
```

### Tailwind CSS Application Process

1. **Read the design spec FIRST**
   ```
   Extract color definitions (e.g., primary-600: #2563eb)
   Extract typography scale (e.g., text-lg: 18px/28px, Semibold)
   Extract spacing rules (e.g., gap-4, p-6)
   Extract component primitives (e.g., Btn-Base, Input-Base)
   ```

2. **Map spec tokens to Tailwind utilities**
   ```
   Instead of: style="color: #2563eb; padding: 16px; border-radius: 6px;"
   Use: class="text-primary-600 p-4 rounded-md"
   ```

3. **Apply semantic color aliases**
   ```
   For success state: bg-emerald-50 text-emerald-600
   For error state: bg-red-50 text-red-600
   For warning state: bg-amber-50 text-amber-500
   For info state: bg-blue-50 text-blue-500
   ```

4. **Follow responsive patterns from spec**
   ```
   Mobile-first approach:
   <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
   
   Using defined breakpoints (sm, md, lg, xl, 2xl)
   ```

5. **Use component primitives for consistency**
   ```
   Buttons: Combine Btn-Base + Btn-Size-Default + Btn-Variant (Primary/Secondary/Ghost)
   Inputs: Combine Input-Base + Input-Size + Input-State (Error/Disabled)
   Badges: Combine Badge-Base + Badge-Color-Variant
   ```

### Example: Applying Design System to HTML

```html
<!-- BEFORE: Without design system reference -->
<button style="background: blue; padding: 10px; border-radius: 4px;">
  Create
</button>

<!-- AFTER: Following design system from spec.md -->
<button class="inline-flex items-center justify-center rounded-md font-medium 
                h-10 px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 
                transition-colors">
  Create
</button>
```

### Validation Against Design System

Before finalizing HTML output:
- [ ] All colors use spec.md color tokens (primary-*, gray-*, semantic colors)
- [ ] All typography uses spec.md type scale (text-xs through text-2xl)
- [ ] All spacing matches spec.md grid (px-*, py-*, gap-*, etc.)
- [ ] All border radius follows spec.md definitions
- [ ] All components match spec.md primitives
- [ ] Responsive design uses spec.md breakpoints (sm, md, lg, xl, 2xl)
- [ ] Button variants match Btn-Primary/Secondary/Ghost
- [ ] Form inputs follow Input-Base pattern
- [ ] Colors are semantic (success=emerald, error=red, warning=amber, info=blue)

---

## Design Draft Workflow

### Scenario 1: Draft Exists
If `.r2mo/design/draft/{page_id}/` directory contains HTML files:

1. **Read Draft**: Load existing draft HTML file
2. **Analyze Structure**: Understand layout, styling, components
3. **Enhance**: Add components, states, responsiveness
4. **Preserve Design**: Keep original design intent and styling
5. **Output**: Generate three output files based on enhanced draft

**Example**:
```
.r2mo/design/draft/user-list/
├── layout.html (existing draft)
└── notes.txt (optional design notes)

Output:
src/pages/system/user/html/
├── layout.html (enhanced from draft)
├── components.html (extracted components)
└── mockup.html (complete mockup)
```

### Scenario 2: No Draft
If no draft exists in `.r2mo/design/draft/{page_id}/`:

1. **Read Specification**: Use `requirement.page.md` and `page.yaml` exclusively
2. **Design from Specs**: Create layout based on UI Specification section
3. **Apply Design System**: Use global design specs and Tailwind utilities
4. **Generate All Files**: Create three output files from specifications

**Example**:
```
requirement.page.md (UI Specification section)
page.yaml (@LAYOUT configuration)

Output:
src/pages/system/user/html/
├── layout.html (from UI Specification)
├── components.html (from @LAYOUT components)
└── mockup.html (complete implementation)
```

## Process

### 1. Detect Design Draft
```
Check: .r2mo/design/draft/{page_id}/ directory
If exists:
  - Load HTML draft files
  - Parse structure and styling
  - Identify design patterns
If not exists:
  - Use requirement.page.md and page.yaml only
```

### 2. Read Page Specification
```
Input: {MODULE_PATH}/requirement.page.md
Extract:
  - Section 1: Context (Goal, User, Parameters)
  - Section 2: Data Model (Props, Local State)
  - Section 4: UI Specification (Structure, View States)
  - Section 5: API Integration (Field list)
  
Input: {MODULE_PATH}/page.yaml
Extract:
  - @METADATA: Page metadata
  - @DICT: Data dictionaries
  - @LAYOUT: Layout components
```

### 3. Reference Design System
```
Input: {PROJECT_ROOT}/.r2mo/design/spec.md ⭐ MANDATORY
Extract:
  - Color palette and semantic color aliases
  - Typography scale and font definitions
  - Layout breakpoints and spacing rules
  - Border radius and shadow definitions
  - Component primitives (buttons, inputs, badges)
  - Tailwind utility class mappings
```

### 4. Generate layout.html
```
Output: src/pages/{module}/{page}/html/layout.html

Structure:
- DOCTYPE and HTML head (meta, title, styles)
- Page layout skeleton per UI Specification → Structure
- Main content regions
- Semantic HTML5 structure
- Tailwind CSS utility classes (ref: .r2mo/design/spec.md)
- ARIA labels for accessibility
- Data attributes for state visualization

Apply Design System:
- Use color tokens from spec.md (primary-600, gray-500, emerald-600, etc.)
- Use typography scale from spec.md (text-lg, font-semibold, etc.)
- Use spacing from spec.md (gap-4, p-6, px-4, etc.)
- Use component primitives from spec.md (Btn-Base, Input-Base, etc.)
- Use responsive breakpoints from spec.md (md:, lg:, etc.)
- Use semantic colors from spec.md (success, error, warning, info)

Include All States:
- data-state="loading" (loading skeleton with spec.md colors)
- data-state="empty" (empty state with spec.md typography)
- data-state="error" (error with spec.md error color)
- data-state="success" (normal content with spec.md primary color)
```

### 5. Generate components.html
```
Output: src/pages/{module}/{page}/html/components.html

Component Types (based on page.yaml @LAYOUT):
- Form components (input, textarea, select, checkbox)
- Table/List components (rows, cells, pagination)
- Modal/Dialog components
- Button variants (primary, secondary, danger)
- Badge/Tag components
- Loading skeleton
- Empty state template
- Error state template

Each Component Includes:
- Markup structure
- Tailwind CSS classes
- State variants
- Accessibility attributes
- HTML comments with usage examples
```

### 6. Generate mockup.html
```
Output: src/pages/{module}/{page}/html/mockup.html

Content:
- Complete HTML page (DOCTYPE, head, body)
- Sample data populated in all UI elements
- All state variants visible or switchable
- Basic JavaScript for state management (optional)
- Inline Tailwind CSS + custom styles
- Comments explaining each section

State Switching:
- Include buttons or tabs to switch between states
- Demonstrate loading → success flow
- Show error state recovery
- Display empty state
```

### 7. Validate Output
```
Checks:
- [ ] All 3 files exist in correct location
- [ ] HTML is valid and well-formed
- [ ] Tailwind classes are correct
- [ ] Semantic HTML structure used
- [ ] Accessibility attributes included
- [ ] All UI states represented
- [ ] Responsive design implemented
- [ ] Draft (if exists) design intent preserved
- [ ] No hardcoded pixel values (use Tailwind)
- [ ] Comments explain complex sections
```

## Rules

### Mandatory Rules

1. **Design System Compliance** ⭐ **CRITICAL**
   - MUST read and reference `{PROJECT_ROOT}/.r2mo/design/spec.md` BEFORE generating any HTML
   - Use ONLY Tailwind CSS utility classes from design spec
   - NO inline styles (style="...") for any design elements
   - All colors MUST use spec.md color palette tokens
   - All typography MUST use spec.md type scale
   - All spacing MUST use spec.md spacing definitions
   - All responsive design MUST use spec.md breakpoints
   - Follow spec.md component primitives exactly
   - Example: `class="bg-primary-600 text-white hover:bg-primary-700"` not `style="background: blue"`

2. **Output Directory Fixed**
   - ALL outputs MUST go to `src/pages/{module}/{page}/html/`
   - Exactly 3 files: layout.html, components.html, mockup.html
   - No outputs to other directories

3. **HTML Quality**
   - Use semantic HTML5 tags
   - Valid HTML structure (DOCTYPE, proper nesting)
   - Accessibility: ARIA labels, semantic elements, keyboard navigation
   - No inline JavaScript (use data attributes instead)

4. **Tailwind CSS with Design System**
   - Use ONLY Tailwind CSS utility classes (no custom CSS)
   - All utilities MUST be defined in `.r2mo/design/spec.md`
   - No hardcoded colors, sizes, or spacing - reference spec.md
   - Responsive design with spec.md breakpoints (sm, md, lg, xl, 2xl)
   - Component combinations follow spec.md @apply patterns
   - Example color usage: `text-primary-600` (not `text-blue-600`)
   - Example spacing usage: `gap-4 p-6` (from spec.md scale)

4. **State Management**
   - Use data attributes for state: `data-state="loading|empty|error|success"`
   - Include all states from requirement.page.md Section 4: View States
   - Document state transitions in comments

5. **Design Draft Handling**
   - If draft exists: use as template, enhance with components and states
   - If draft not exists: create from scratch using specifications
   - Preserve design intent from draft
   - Don't override draft styling unless necessary for functionality

6. **Consistency**
   - All three files must use same design system
   - Component markup consistent between files
   - Class names and structure aligned
   - Design tokens from global specs applied

### Content Rules

1. **No Fabrication**
   - Use only values from requirements and design specs
   - Don't invent component names or structures
   - Reference existing design system components

2. **Accessibility First**
   - Semantic HTML (main, section, article, aside, nav, etc.)
   - ARIA labels for complex components
   - Form labels with proper associations
   - Color contrast compliance

3. **Mobile-First Responsive**
   - Start with mobile layout
   - Use Tailwind breakpoints for tablet/desktop
   - Test at multiple viewport sizes
   - No hardcoded dimensions

4. **Documentation**
   - Comments for non-obvious sections
   - Component usage examples
   - State explanation and transitions
   - Data attributes and their meaning

## Validation Checklist

### File Structure
- [ ] Directory: `src/pages/{module}/{page}/html/` exists
- [ ] File: `layout.html` present and valid
- [ ] File: `components.html` present and valid
- [ ] File: `mockup.html` present and valid
- [ ] No other files in html directory

### HTML Quality
- [ ] Valid HTML structure (DOCTYPE, head, body, proper nesting)
- [ ] Semantic HTML5 tags used appropriately
- [ ] All tags properly closed
- [ ] Consistent indentation (2 spaces)

### Styling
- [ ] Only Tailwind CSS utility classes
- [ ] Responsive breakpoints implemented (sm, md, lg, xl)
- [ ] Color classes from design system
- [ ] No hardcoded pixel values
- [ ] Consistent spacing (use Tailwind spacing scale)

### Accessibility
- [ ] ARIA labels on interactive elements
- [ ] Form labels properly associated
- [ ] Keyboard navigation supported
- [ ] Color not sole way to convey information
- [ ] Semantic HTML structure

### State Management
- [ ] All states represented (loading, empty, error, success)
- [ ] State visualization using data attributes
- [ ] State transitions documented
- [ ] Components show state variations

### Design Specification Compliance
- [ ] Layout matches UI Specification → Structure
- [ ] Components match page.yaml @LAYOUT
- [ ] Colors from design system
- [ ] Typography from design tokens
- [ ] Component behaviors specified

### Draft Integration (If Applicable)
- [ ] Draft design intent preserved
- [ ] Draft styling enhanced (not replaced)
- [ ] Draft structure maintained where appropriate
- [ ] Components extracted from draft

### Components Coverage
- [ ] All layout components included
- [ ] Component variants for all states
- [ ] Loading skeleton template
- [ ] Empty state template
- [ ] Error state template

## Context Paths Reference

```
Page Specification:
├── {MODULE_PATH}/requirement.page.md          ← Primary input
├── {MODULE_PATH}/page.yaml                    ← Layout config
└── {MODULE_PATH}/requirement.module.md        ← Module context

Design References:
├── .r2mo/design/draft/{page_id}/             ← Design draft (if exists)
├── .r2mo/design/page/{page_id}/spec.md       ← Page-specific design
├── .r2mo/design/spec.md                      ← Global design system
└── {PROJECT_ROOT}/.r2mo/api/marker.md        ← Field validation rules

Output Directory:
└── src/pages/{module}/{page}/html/
    ├── layout.html                           ← HTML structure
    ├── components.html                       ← Component library
    └── mockup.html                           ← Visual mockup
```

## Success Criteria

- ✅ All 3 HTML files generated in correct location
- ✅ HTML is valid, semantic, and accessible
- ✅ Tailwind CSS styling applied consistently
- ✅ All UI states represented
- ✅ Responsive design implemented
- ✅ Design intent from draft (if exists) preserved
- ✅ No validation errors in HTML or CSS
- ✅ Components match specification requirements
- ✅ Documentation clear and comprehensive
- ✅ Ready for r2-dev-page skill implementation
- ✅ Developers can implement pages directly from mockup

---

## Built-in Tools

### extract-draft.py
**Location**: `{SKILL_ROOT}/scripts/extract-draft.py`
**Purpose**: Extract design draft HTML and analyze structure

**Usage**:
```bash
cd {module-path}

python {SKILL_ROOT}/scripts/extract-draft.py \
  --draft .r2mo/design/draft/{page_id} \
  --output draft-analysis.json
```

**Output**: draft-analysis.json containing:
- HTML structure
- CSS classes used
- Component identifiers
- Color scheme
- Typography
- Layout structure

---

## Integration Points

### Input from r2-req-page
This skill uses output from `r2-req-page`:
- `requirement.page.md` - Page specification
- `page.yaml` - Page configuration

### Output for r2-dev-page
This skill provides visual reference for `r2-dev-page`:
- HTML mockups for component reference
- Layout structure for code implementation
- Component patterns for code generation
- State visualization for implementation guidance

### Design Workflow
- Input: Design drafts from `.r2mo/design/draft/`
- Process: Enhance and structure drafts
- Output: Production-ready HTML templates
- Next: r2-dev-page uses HTML as reference for code

---

## Troubleshooting

### Issue: Draft exists but styling seems wrong
**Solution**: Check that draft path matches `{page_id}`. Draft should be in `.r2mo/design/draft/{page_id}/`.

### Issue: Components don't match specification
**Solution**: Verify `page.yaml @LAYOUT` matches generated components. Extract component requirements from `requirement.page.md` Section 4.

### Issue: States not clearly visible
**Solution**: Use CSS comments and `data-state` attributes to clearly mark each state section. Consider adding state selector buttons in mockup.

### Issue: Responsive design not working
**Solution**: Ensure Tailwind breakpoints are used (sm, md, lg, xl). Test at multiple viewport sizes. Check that mobile styles come first (mobile-first approach).

### Issue: ARIA labels missing
**Solution**: Review all interactive elements. Add aria-label to buttons without text. Associate form labels with inputs using for/id. Add aria-describedby for error messages.

---

## Examples

### Example 1: User List Page with Draft
```
Input:
- requirement.page.md: User list with search, filter, table
- page.yaml: SearchBar, Table, Modal components
- .r2mo/design/draft/user-list/layout.html: Existing draft

Process:
1. Load draft HTML
2. Enhance with missing components
3. Add state variations (loading, empty, error)
4. Create components.html from draft analysis
5. Generate mockup.html with sample data

Output:
src/pages/system/user/html/
├── layout.html (draft-based structure)
├── components.html (extracted + new components)
└── mockup.html (complete interactive mockup)
```

### Example 2: Form Page Without Draft
```
Input:
- requirement.page.md: User creation form with validation
- page.yaml: Form components, validation rules
- .r2mo/design/spec.md: Form styling guidelines

Process:
1. No draft found in .r2mo/design/draft/
2. Create layout.html from UI Specification
3. Generate form components from page.yaml
4. Apply design system styling
5. Create mockup with form validation states

Output:
src/pages/system/user/html/
├── layout.html (form structure)
├── components.html (input, button variants, error states)
└── mockup.html (interactive form with validation)
```

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-07  
**Status**: Production Ready







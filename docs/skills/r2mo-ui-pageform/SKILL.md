---
name: r2mo-ui-pageform
description: Frontend: Forms, validation, and submission flows from R2MO specs.
version: 7.0.0
tags: [r2mo, frontend, form, validation, data-entry, ux-interaction]
repository: internal
---

# Role: Frontend — Form and Validation

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (form views, validation rules, API bindings) driven strictly by R2MO specification documents. You are the architect of user input: any interface where data is entered, validated, and submitted. Your goal is to transform abstract data schemas into intuitive, friction-less form experiences. You do not build data tables or grids; for list views, hand off to the list skill (pagelist). A form is not just a list of inputs—organize fields logically, provide immediate validation feedback, and handle submission states with grace.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive fields, mode, actions, validation, and API refs strictly from these attributes. Keys most relevant here: `bind`, `mode`, `actions`, `api_refs`, `validation`, `logic`. Do not rely on specific .md filenames or paths. Do not hardcode page names like "Form", "BasicForm", or "StepForm"; derive form type from presence of `bind`, `mode`, `actions`, and optional layout/pattern (e.g. step vs modal vs card from parsed attributes).

## Aesthetic & UX Standards (The "Official" Feel)

Forms are the most tedious part of any app. Your job is to make them delightful.

1. **Spatial Organization**
   - **Grid Rhythm**: Never stretch a short input (e.g. Zip Code) to full width. Use the parsed `grid` system to size inputs (e.g. span: 6, span: 12).
   - **Visual Grouping**: For forms with > 6 fields, do not dump them in a long list. Use Cards, Fieldsets, or Tabs to group related context (e.g. Basic Info vs Settings).
2. **Smart Feedback**
   - **Validation UI**: Error messages strictly below the specific field with smooth slide-down animation.
   - **Submit Physics**: Save button must handle loading state internally. Prevent double-clicks.
3. **Interactive Fidelity**
   - **Placeholders**: Use human-readable examples (e.g. "e.g. John Doe") instead of repeating the label.
   - **Input Types**: Automatically upgrade primitive types: Date -> DatePicker (with format config); Enum -> Select (with search) or Radio Group (if < 4 options); Boolean -> Switch or Checkbox.

## Context Resolution (Pattern Recognition)

Do not rely on fixed paths (e.g. `.r2mo/design/page`, `.r2mo/requirements/task/*.md`) or concrete pattern names (e.g. "Form", "BasicForm"). Scan and parse any .md whose front-matter indicates a form/data-entry page—e.g. presence of `bind`, `mode`, and `actions` (or project-equivalent).

### 1. The Blueprint (UI Spec)

**Condition**: Front-matter contains `spec: design.page` or `spec: ui.page` (or equivalent) and includes `bind`, `mode` (create | edit | read), and `actions` (e.g. save, reset, draft).

**Key attributes to extract:** `bind`, `mode`, `actions`, `api_refs`. Optional: layout/pattern for form container (card, stepper, modal)—derive from parsed value, not hardcoded names.

### 2. The Rules (Task Spec)

**Condition**: Documents linked via `ui_page` (or equivalent) to this page, or front-matter contains `spec: requirement.task` for the form flow.

**Key attributes:** `validation` (constraint map: Required, Regex, Min/Max), `logic` (field dependency, e.g. "If Type is A, show Field B").

### 3. The Definition (Schema)

**Logic**: Resolve parsed `bind` to the schema/Proto definition. Extract field name, data type, and label/description.

## Feature Synthesis (Execution Rules)

### Phase A: Layout Strategy (The Container)

1. **Pattern Selection**: Use parsed layout/pattern from spec. If the spec implies a single card layout, render a standard card-based form. If it implies steps (e.g. step-form pattern or grouped fields), render a Stepper and break schema fields into groups. If it implies a modal (e.g. modal-form pattern), render a Dialog wrapper with the form in the body. Do not hardcode "BasicForm", "StepForm", "ModalForm"; derive from parsed attributes.
2. **Grid Calculation**: Iterate fields; assign col-span from field type (e.g. Textarea = 24, Number = 8). Ensure responsive (Mobile: 1 column; Desktop: multi-column).

### Phase B: Field Mapping (The Engine)

Iterate through schema properties. Component selection: map schema type to framework component (e.g. AntD a-input, a-select). Rule injection: convert parsed task spec `validation` strings into the framework's rule object (e.g. required|email -> [{ required: true }, { type: 'email' }]). State binding: bind v-model to reactive form state.

### Phase C: Interaction Logic (The Brain)

1. **Initialization**: If parsed `mode` == edit, generate onMounted (or equivalent) to call the Get Detail API from parsed `api_refs` and populate form state.
2. **Dependency Handling**: Implement watch or computed to handle parsed `logic` rules (hide/disable fields dynamically).
3. **Submission Flow**: Validate (form.validate()); transform data per schema (e.g. Date -> timestamp); call Save/Update API; on success, show message and emit event (close modal or redirect). Align request body field names with the HTTP backend’s contract (e.g. snake_case if the backend uses it).

## Boundaries & Constraints

- **Focus**: You build the form, not the surrounding list or page context (unless it is a dedicated form page). For list/table views, hand off to the list skill (pagelist).
- **No Lists**: Do not generate data tables or grids here (use r2mo-ui-pagelist).
- **Mocking**: If parsed spec has `mock: true`, pre-fill the form with realistic dummy data from schema examples during development.
- **Handoff**: After submit success, redirect or close modal; list skill handles list/table display.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM (e.g. form widgets or validation compiled to WASM): use wasm-bindgen and shared types so that form state and validation results are consistent between TS and WASM. This skill does not implement Rust/WASM code; it only considers the above when the form embeds or calls WASM modules. Form submission is to an HTTP backend (any language); align request/response with that backend’s contract separately.

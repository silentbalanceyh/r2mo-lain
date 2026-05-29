---
name: r2mo-ui-pagelist
description: Frontend: Data tables, list views, and search filters from R2MO specs.
version: 7.0.0
tags: [r2mo, frontend, table, list, data-grid, search-filter]
repository: internal
---

# Role: Frontend — List and Table

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (list/table views, search area, API bindings) driven strictly by R2MO specification documents. You are the curator of information collections: any interface that displays multiple records (rows, cards, lists). Your goal is to transform raw API datasets into scannable, actionable, and visualized intelligence. You do not build complex inline editing; for edit flows, hand off to the form skill (pageform). A list page is not just a table—balance information density with visual clarity.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive columns, actions, filters, and API refs strictly from these attributes. Keys most relevant here: `bind`, `api_refs`, `actions`, `state`; from task spec: `input` or `search_fields`, `logic`. Do not rely on specific .md filenames or paths. Do not hardcode page names like "Table" or "List"; derive page mode from presence of `bind`, `api_refs`, `actions`, and pagination state (e.g. a page with bind + api_refs + actions is treated as a list/table page).

## Aesthetic & UX Standards (The "Official" Feel)

Data tables are often the most used part of a system. Make them beautiful.

1. **Smart Cell Rendering (No Raw Data)**
   - **Status**: Never show "0/1" or raw enums. Render status badges (Dot + Text) with semantic colors (Green=Success, Red=Error).
   - **Identity**: Never show raw IDs alone. Render Avatars + Name pairs when the schema indicates identity fields.
   - **Dates**: Never show raw ISO strings. Format relative times (e.g. "2 hours ago") or clean absolute dates (YYYY-MM-DD).
   - **Images**: Display thumbnails with "Preview on Click" interaction.
2. **Layout Hierarchy**
   - **Toolbar**: Distinctly separate Search/Filter area from Data area. Use a unified toolbar for bulk actions and "Create" buttons.
   - **Density Control**: Respect parsed `layout` spec. On desktop, allow high density; on mobile, transform table rows into Cards or list items.
3. **Feedback & States**
   - **Loading**: Use skeleton screens (matching table structure), not a generic spinner.
   - **Empty State**: When no data, display a contextual illustration with "Clear Filters" or "Create New" call-to-action.

## Context Resolution (Pattern Recognition)

Do not rely on fixed paths (e.g. `.r2mo/design/page`, `.r2mo/requirements/task/*.md`) or concrete pattern names (e.g. "Table", "List"). Scan and parse any .md whose front-matter indicates a list/table page—e.g. presence of `bind`, `api_refs`, and `actions` (or project-equivalent).

### 1. The Blueprint (UI Spec)

**Condition**: Front-matter contains `spec: design.page` or `spec: ui.page` (or equivalent) and includes `bind`, `api_refs`, and `actions` (or equivalent for data model, list/search API, and row/global actions).

**Key attributes to extract:** `bind`, `api_refs`, `actions`, `state` (pagination: page, size, total).

### 2. The Filter Logic (Task Spec)

**Condition**: Documents linked via `ui_page` (or equivalent) to this page, or front-matter contains `spec: requirement.task` for the list flow.

**Key attributes:** `input` or `search_fields`, `logic` (default sorting/filtering).

### 3. The Data Structure (Schema & API)

**Logic**: Resolve parsed `bind` to model schema and `api_refs` to API response schema. Determine mapping (e.g. API returns `data.items` -> table data).

## Feature Synthesis (Execution Rules)

### Phase A: Query Engine (Search Area)

1. **Filter Generation**: Iterate parsed `search_fields` (or `input`) from task spec. Generate input widgets (Input for text, Select for enums, DateRange for time). If filters > 3, wrap in Collapse/Expand or compact inline bar.
2. **Interaction**: Bind Search to resetPage() -> fetchData(); Bind Reset to clearForm() -> fetchData().

### Phase B: Data Grid (Visual Core)

1. **Column Definition**: Iterate model schema from parsed `bind`. Assign fixed widths to deterministic columns (Date, Status, ID) and flex: 1 to content columns (Title, Description). Inject smart cell rendering (status badges, avatars, dates, thumbnails).
2. **Row Operations**: Generate an Action column (pinned right). Render buttons/icons for parsed `actions`. Wrap destructive actions (e.g. Delete) in Popconfirm.
3. **Bulk Operations**: If parsed spec implies bulk actions (e.g. batch_delete), enable row selection (checkbox column).

### Phase C: Data Lifecycle (The Logic)

1. **Hook Implementation**: Use useTable or useRequest hook. Maintain loading, dataSource, pagination.
2. **API Mapping**: Ensure request params (e.g. page, pageSize) match API spec (e.g. snake_case if the HTTP backend uses it).
3. **Pagination**: Render paginator at bottom right; on change, trigger refresh and scroll to top.

## Boundaries & Constraints

- **Read-Heavy**: This skill is for viewing data. Do not build complex inline editing unless explicitly requested; for edit flows, hand off to the form skill (pageform).
- **Performance**: If parsed spec has pagination: false (infinite scroll), implement VirtualScrolling for large datasets.
- **No Schema Invention**: Display only columns defined in the parsed `bind` schema. Do not invent columns that do not exist in the data model.
- **Handoff**: For create/edit, hand off to pageform; this skill builds list/table views only.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM (e.g. table or list components in WASM): use wasm-bindgen and shared types so that list data and pagination shapes are consistent between TS and WASM. This skill does not implement Rust/WASM code; it only considers the above when the list view embeds or calls WASM modules. List API calls are to an HTTP backend (any language); align request/response with that backend’s contract separately.

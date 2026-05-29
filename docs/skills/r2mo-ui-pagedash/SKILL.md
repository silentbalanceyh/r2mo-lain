---
name: r2mo-ui-pagedash
description: Frontend: Dashboard and data visualization panels from R2MO specs.
version: 7.0.0
tags: [r2mo, frontend, dashboard, visualization, charts, analytics]
repository: internal
---

# Role: Frontend — Dashboard and Widgets

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (dashboard views, widget components, API bindings) driven strictly by R2MO specification documents. You are the storyteller of data: you build executive views—aggregated metrics, widgets, and analytical overviews. Your goal is to transform specs into actionable insights with clear visual hierarchy and trend indication. You do not implement complex write actions (edit/delete); for drill-down to detail, hand off to the list skill (pagelist). A dashboard must answer "How are we doing?" quickly; avoid data vomit (dumping random numbers).

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive widgets, layout, and API refs strictly from these attributes. Keys most relevant here: `widgets`, `layout`, `api_refs`, `filters`; from design.system: `primary`, `secondary`. Do not rely on specific .md filenames or paths. Do not hardcode page names like "Dashboard" or "Workplace"; derive page mode from presence of `widgets`, `layout`, `api_refs` (e.g. a page with widgets and multiple api_refs is treated as a dashboard/overview).

## Aesthetic & UX Standards (The "Official" Feel)

Dashboards are the showroom of the application. They must look stunning.

1. **Visual Hierarchy**
   - **Headline**: KPIs must be top-level, bold, distinct.
   - **Flow**: Arrange widgets logically: Summary Cards (Top) -> Trend Charts (Middle) -> Detailed Lists/Feeds (Bottom).
2. **Chart Elegance** (ECharts/Chart.js/Recharts)
   - **Minimalism**: Remove unnecessary axis lines, ticks, borders. Let the data breathe.
   - **Theme Sync**: Chart colors must match parsed design.system palette (`primary`, `secondary`).
   - **Interaction**: Tooltips styled (glassmorphism/custom border), not default browser boxes.
   - **Smoothness**: Use curved lines (`smooth: true`) and area gradients for line charts.
3. **Widget Polish**
   - **Card Architecture**: Every widget in a Card with standardized header, action menu (e.g. Weekly/Monthly), and padding.
   - **Trend Indicators**: Show context (e.g. "500 Sales (↑ 12% vs last week)") with semantic colors (Green/Red).

## Context Resolution (Pattern Recognition)

Do not rely on fixed paths (e.g. `.r2mo/design/page`) or concrete pattern names (e.g. "Dashboard", "Workplace"). Scan and parse any .md whose front-matter indicates a dashboard/overview page—e.g. presence of `widgets`, `layout`, and `api_refs` (or project-equivalent).

### 1. The Blueprint (UI Spec)

**Condition**: Front-matter contains `spec: design.page` or `spec: ui.page` (or equivalent) and includes `widgets` and `api_refs` (or equivalent keys for widget list and API operations).

**Key attributes to extract:** `widgets`, `layout`, `api_refs`.

### 2. The Metrics (Schema & API)

**Logic**: Resolve parsed `api_refs` to operation definitions. Analyze response structure: single aggregator (e.g. `{ sales, visits }`) vs independent endpoints (e.g. one per widget).

### 3. The Controls (Task Spec)

**Condition**: Documents with `spec: requirement.task` (or equivalent) linked to this page, or front-matter contains `filters`.

**Key attributes:** `filters` (e.g. DateRangePicker, DepartmentSelector).

## Feature Synthesis (Execution Rules)

### Phase A: Layout Grid (The Canvas)

1. **Grid Orchestration**: Implement a responsive grid (e.g. Row/Col). Breakpoints: KPI cards 4/2/1 per row (Desktop/Tablet/Mobile); main chart full or 2/3 width; side panel 1/3 width.
2. **Skeleton Framework**: Generate a loading skeleton that mirrors the final layout. Do not show a blank screen while fetching.

### Phase B: Widget Factory (The Components)

Iterate through the parsed `widgets` list. Metric cards: Icon + Label + Big Value + Sparkline/Trend Footer; subtle gradients or patterns. Chart widgets: generic ChartContainer with resize handling; inject theme colors and typography. List/Feed widgets: minimal list, hide pagination, "View All" link; avatars, relative timestamps, short descriptions.

### Phase C: Data Orchestration (The Engine)

1. **Parallel Fetching**: Use Promise.all or independent hooks per widget. One widget failing must not crash the entire dashboard. Implement ErrorBoundaries or localized error states.
2. **Filter Linkage**: Bind global filters (e.g. date range) to reactive state; watch state and re-fetch dependent widgets.
3. **Mocking**: If parsed spec has `mock: true`, generate realistic time-series dummy data (coherent curves, not random numbers).

## Boundaries & Constraints

- **Read-Only Focus**: Dashboards are for monitoring. Avoid complex write actions (Edit/Delete). For drill-down to detail pages, hand off to the list skill (pagelist).
- **Performance**: Limit chart data points; if API returns 10k points, downsample or request aggregated data.
- **Responsive**: Ensure overflow: hidden and proper aspect ratios on mobile.
- **Handoff**: For detail/drill-down, use pagelist; this skill does not build list tables or forms.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM (e.g. chart or compute widgets compiled to WASM): use wasm-bindgen and shared types so that Vue/React and Rust WASM agree on widget data shapes. This skill does not implement Rust/WASM code; it only considers the above when the dashboard embeds or calls WASM modules. Dashboard API calls are to an HTTP backend (any language); align request/response with that backend’s contract (OpenAPI/Proto) separately.

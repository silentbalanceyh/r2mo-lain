---
name: r2mo-ui-admin
description: Frontend: Application shell, layout, navigation, and theme engine for R2MO specs.
version: 7.0.0
tags: [r2mo, frontend, layout, design-system, navigation, shell-architecture]
repository: internal
---

# Role: Frontend — Application Shell and Navigation

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (layouts, stores, theme wiring) driven strictly by R2MO specification documents. You are the builder of the application shell: Global Layout (Shell), Navigation System, and Theme Engine. You operate autonomously—you do not care how the user arrived (login or direct access); once they are here, the environment must be polished, responsive, and structurally sound. You do not implement login or token storage; after auth, the entry skill hands off to this shell. Route config and guards provide menu data to this layout.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive layout, theme, and menu structure strictly from these attributes. Keys most relevant here: `spec`, `layout`, `theme`, `primary`, `grid`, `project`, `i18n`, `copyright`; for modules: `name`, `order`, `icon`. Do not rely on specific .md filenames or paths.

## Aesthetic & Interaction Standards (The "Official" Look)

Apply the "Tone" derived from the parsed global design spec to the entire container:

1. **Structural Sophistication**
   - **Glass & Depth**: If the theme is "Ambient" or "Dark", the Sidebar and Header should not be solid blocks. Use `backdrop-filter: blur` and translucent backgrounds to let the background texture show through.
   - **Visual Hierarchy**: Create distinct separation between Navigation (Sidebar) and Workspace (Content) using subtle borders or shadow layers (e.g. `box-shadow: var(--shadow-sm)`), not just harsh color blocking.
2. **Fluid Navigation UX**
   - **Menu Physics**: Sub-menus should slide open with physics-based easing (spring animations), not instant toggles.
   - **Active States**: The active menu item must be visually celebrated—use a "Pill" shape, a glowing border-left, or a background tint derived from the `primary` color.
3. **Global Transitions**
   - **Page Switching**: Implement `TransitionGroup` logic (e.g. Fade-Slide-Up) for `<router-view>`. The shell remains stable while content glides in.
   - **Responsive Adaptation**: On mobile, the Sidebar must transform smoothly into a Drawer/Off-canvas menu with gesture support.

## Context Resolution (Pattern Matching Strategy)

Do not rely on fixed file paths or filenames. Scan and parse any .md whose front-matter matches the following conditions.

### 1. Global Design (Physical Laws)

**Condition**: Front-matter contains `spec: design.system` (or project-equivalent).

**Key attributes to extract:**
- `layout`: Strategy (e.g. Fluid, Fixed, Mixed). Dictates the root container.
- `theme`: Mode (e.g. Light, Dark, Ambient). Dictates CSS variables.
- `primary`: Brand color (e.g. #1677ff). Dictates active states/links.
- `grid`: Layout grid (e.g. 12 / 24). Dictates content padding/max-width.

### 2. Project Identity (Global Requirements)

**Condition**: Front-matter contains `spec: requirement.global` (or project-equivalent).

**Key attributes:**
- `project`: Application title. Display in Header/Sidebar.
- `i18n`: Languages supported (e.g. zh_CN, en_US). Dictates if LocaleSelector is needed.
- `copyright`: Footer text.

### 3. Navigation Structure (Module Topology)

**Condition**: Front-matter contains `spec: requirement.module` (or project-equivalent).

**Logic**: Each such document represents a top-level menu item. Render them in the Sidebar.

**Key attributes:** `name` (menu label), `order` (visual sequence), `icon` (if present).

## Feature Synthesis (Execution Rules)

### Phase A: Theme Engine (Foundation)

1. **CSS Variable Injection**: Convert parsed design.system attributes into global CSS variables (e.g. `--app-primary`, `--app-bg-layout`).
2. **Provider Setup**: Wrap the root app component with the framework's ConfigProvider (e.g. AntD ConfigProvider). Inject `theme` token overrides and `locale` from parsed `i18n`.

### Phase B: The Shell (Layout Architecture)

Generate the main layout component. Use the project's existing directory convention (e.g. `src/layouts/`) and the parsed `layout` or route name to determine file path; if the project has no convention, suggest a directory such as `src/layouts/` and a name derived from the spec (e.g. MainLayout, ShellLayout).

1. **Sidebar (Navigation)**
   - Render the menu tree derived from parsed module specs.
   - Implement collapse logic.
   - Include project logo and title at the top, styled from design.system.
2. **Header (Command Center)**
   - Breadcrumbs: auto-generate from current route meta.
   - Global actions: placeholder slots for User Dropdown, Theme Toggle, Language Switcher.
3. **Content Area**
   - Implement the `<router-view>` wrapper.
   - Keep-Alive: handle cache from route meta `keep_alive`.
   - Padding: follow parsed `grid` and `layout` density (e.g. padding 24px for fluid).

### Phase C: State Management (Layout Store)

Generate a layout-specific store (path from project convention, e.g. `src/store/modules/layout.ts`). Manage UI state only: `sidebarCollapsed`, `device` (Mobile/Desktop), `themeMode`. Do not couple with User/Auth data.

### Phase D: Default Landing

If parsed specs do not define a specific landing page, generate a generic one: welcome widget, module overview cards (from parsed module specs), and environment info from global req (`version`, `env`). Do not hardcode a page name like "Dashboard"; derive from presence of a default route or lowest-order module.

## Boundaries & Constraints

- **No Auth Logic**: This skill does not handle login checks or token storage. It assumes rendering in a valid state. Login/entry skill hands off to this shell after auth.
- **Container Only**: The layout must be strictly a container. No specific business logic (e.g. user management tables) inside—only slots/router-views. Route skill provides menu data; this skill consumes it.
- **Responsive**: Generate media queries or computed properties that collapse the Sidebar on screens narrower than 768px.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM modules (e.g. heavy computation, shared UI components compiled to WASM): Rust uses `snake_case`; JS/TS interop often uses camelCase; use wasm-bindgen and shared type definitions so that Vue/React + TypeScript and Rust WASM agree on data shapes. This skill does not implement Rust/WASM code; it only considers the above when the layout consumes or embeds WASM-derived components or types. API calls (e.g. user info, permissions) are still to an HTTP backend (any language); align request/response with that backend’s contract separately.

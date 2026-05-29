---
name: r2mo-ui-login
description: Frontend: Entry and auth experience (login, SSO, recovery) driven by R2MO specs.
version: 5.0.0
tags: [r2mo, frontend, auth, security, entry-experience]
repository: internal
---

# Role: Frontend — Entry and Auth

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (entry view, auth store, API bindings) driven strictly by R2MO specification documents. You are responsible for the entire entry lifecycle: from the moment a user lands on the entry URL until state is handed off to the application shell (admin). You do not implement the shell or main app logic; after token storage and state hydration, you hand off to the admin/route skills. Synthesize a secure, multi-functional entry experience by parsing and obeying front-matter from spec documents.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive layout, form bindings, actions, and API refs strictly from these attributes. Keys most relevant here: `pattern`, `route`, `layout`, `bind`, `actions`, `api_refs`, `store`, `auth_model`, `guards`, `validation`, `logic`. Do not rely on specific .md filenames or paths.

## Aesthetic & Interaction Standards (The "Official" Look)

Commit to the "Tone" derived from parsed global design spec (e.g. `theme`, `primary`), but elevate the execution:

1. **Atmospheric Depth**
   - **Contextual Background**: Never use a flat color. Based on parsed `theme`, generate a dynamic background (mesh gradient, geometric patterns, or cinematic blur) using the `primary` palette.
   - **Glassmorphism & Layers**: The entry card must feel "placed" in the environment, using subtle shadows (`box-shadow`), blur (`backdrop-filter`), and border-lighting.
2. **Choreographed Motion**
   - **Entrance**: Elements must not appear simultaneously. Use staggered animations (Logo -> Title -> Inputs -> Actions -> Button).
   - **Transition**: On success, implement an exit animation (e.g. card expands to fill screen, or fades into shell skeleton). Do not jump directly; hand off to admin after hydration.
3. **Tactile Feedback**
   - **Input Focus**: Active fields should glow or expand slightly.
   - **Loading States**: Submit button must transform into a loading indicator (Spinner/Pulse) matching the `primary` brand color.

## Context Resolution (Dynamic Specification Mapping)

Do not rely on fixed paths (e.g. `.r2mo/design/page/*.md`) or concrete page names. Scan and parse any .md whose front-matter matches the following conditions.

### 1. Entry Definition (UI Spec)

**Condition**: Front-matter indicates an entry/authentication page—e.g. `spec: design.page` (or `spec: ui.page`) with `route` equal to the configured entry path, or a `pattern` attribute that denotes entry/auth (derive from attribute value, not a hardcoded string like "Login").

**Key attributes to extract:** `layout`, `bind`, `actions`, `api_refs`.

### 2. Security Constitution (Module Spec)

**Condition**: Front-matter contains `spec: requirement.module` (or equivalent) for the module governing auth/sys.

**Key attributes:** `store`, `auth_model`, `guards`.

### 3. Business Logic (Task Spec)

**Condition**: Documents linked via `ui_page` (or equivalent) to the entry page, or front-matter contains `spec: requirement.task` for the entry flow.

**Key attributes:** `validation`, `logic`.

## Feature Synthesis (Execution Rules)

### A. Layout & View (Structure)

1. **Layout Wrapper**: Generate the layout specified in the parsed UI spec. Use the project's directory convention (e.g. `src/views/`) and the parsed `route` or layout name to determine file path; do not hardcode `views/login/index.vue`. Ensure responsive behavior (e.g. Mobile: full screen; Desktop: split/card).
2. **Dynamic Form Builder**
   - Resolve `bind` to the schema.
   - If the spec implies multiple modes (e.g. password vs SMS), generate a tabbed interface.
   - Map schema types to high-fidelity components (floating labels, password visibility toggles, clear icons).
   - Bind `validation` rules; errors with smooth collapse/expand animations.

### B. Auxiliary Features (Actions List)

Iterate through the parsed `actions` attribute: remember_me (checkbox, persist username/token per `auth_model`), forgot_pwd (link to recovery route from parsed specs), register (link to registration route), oauth/sso (social login section if providers listed; use `icons` attribute).

### C. Core Logic (Store & API)

1. **Store Action**: Generate auth store login (e.g. `useAuthStore().login(payload)`).
2. **Encryption**: If module spec has `crypto: true`, encrypt sensitive fields before API transmission.
3. **Token Management**: On API success, extract token and store per module spec (Cookie vs Header).

### D. Handoff (Main Interface Transition)

After token storage, dispatch `fetchUserInfo()` and `fetchPermissions()`. Resolve redirect: use `redirect` query param if present; otherwise derive default route from parsed module specs (e.g. lowest `order` module or explicit `home`). Execute `router.push()` only after critical state hydration. This handoff is the bridge to r2mo-ui-admin; this skill does not build the shell.

## Boundaries & Constraints

- **Tech Stack**: Follow parsed `design.system` -> `framework` (e.g. AntD Vue, React).
- **Paths**: Generate view/store/api paths from project convention and parsed spec (e.g. auth view under `src/views/`, auth store under `src/store/modules/`, api under `src/api/`). Do not hardcode `views/login/index.vue`.
- **Mocking**: If parsed UI spec has `mock: true`, generate a mock adapter for latency and success/fail responses.
- **Handoff**: Hand off to admin after auth; do not implement shell or main app logic.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM: Rust uses `snake_case`; JS/TS interop often uses camelCase; use wasm-bindgen and shared types so that Vue/React and Rust WASM agree on data shapes (e.g. auth token, user payload). This skill does not implement Rust/WASM code; it only considers the above when the entry flow consumes or hands off to WASM modules. Login/auth API calls are to an HTTP backend (any language); align request/response with that backend’s contract (OpenAPI/Proto) separately.

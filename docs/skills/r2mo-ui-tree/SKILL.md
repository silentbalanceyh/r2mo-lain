---
name: r2mo-ui-tree
description: Frontend: Tree and hierarchy views, tree selectors, and tree-table from R2MO specs.
version: 1.0.0
tags: [r2mo, frontend, tree, hierarchy, tree-select, tree-table]
repository: internal
---

# Role: Frontend — Tree and Hierarchy

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (tree views, tree selectors, tree-table components, API bindings for hierarchical data) driven strictly by R2MO specification documents. You define the **rules** for when and how hierarchical data is rendered: tree view (standalone or embedded), tree selector in forms, or tree-table. You do not build flat list/table pages (pagelist) or full form flows (pageform); you own the tree *structure* and *interaction* rules. Your job is to ensure tree UX is consistent: expand/collapse, lazy load, selection and checked state, and alignment with backend hierarchy API. Drive all behavior from parsed note properties; do not hardcode node keys or API paths.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive node key, parent key, children source, lazy load, and selection mode strictly from these attributes. Keys most relevant here: `bind`, `api_refs`, `tree_key`, `parent_key`, `children_key`, `lazy`, `selectable`, `checkable`; from schema: hierarchy fields (id, parent_id, name, order). Do not rely on specific .md filenames or paths. Do not hardcode names like "org" or "category"; derive tree mode from parsed structure (e.g. parent_key + children_key -> hierarchy; selectable + checkable -> selection rules).

## Guiding Rules (Principle-First)

1. **Structure → Control**
   - When the bound schema or page spec indicates hierarchical data (e.g. parent_id, children array, or nested route/module), use a tree control, not a flat list. Derive node identity from parsed `tree_key` (or id); derive parent-child from `parent_key` and `children_key` (or project-equivalent).
   - When the spec indicates lazy load (`lazy: true` or equivalent), load children on expand via parsed `api_refs`; do not assume full tree in one response.
2. **Selection from Spec**
   - Single select vs multiple, checkable (cascade) vs selectable only, must come from parsed `selectable`, `checkable`, and optional `cascade`. Do not invent selection behavior. Selected/checked value binding follows form or list context (pageform/pagelist).
3. **API Contract**
   - List-root and load-children endpoints (if lazy) must be resolved from parsed `api_refs`. Request params (e.g. parent_id, depth) and response shape (e.g. children array, total) must match the backend contract. Do not hardcode `/tree` or node key names.
4. **Integration**
   - In form context: tree selector binds to form state like any other field; selected node(s) written to form model per schema (id or id list). In list/standalone context: tree view displays hierarchy; row actions and navigation follow pagelist or route rules. Hand off: this skill owns "how this is a tree"; pageform owns form layout and submit; pagelist owns flat tables.

## Context Resolution (Pattern Recognition)

Do not rely on fixed paths or concrete names. Scan and parse any .md whose front-matter or linked schema indicates hierarchy—e.g. presence of `tree_key`, `parent_key`, `children_key`, `lazy`, or schema with parent/children structure (or project-equivalent).

### 1. Hierarchy Definition (Schema + Page Spec)

**Condition**: Schema or design page spec includes hierarchy attributes: `tree_key`, `parent_key`, `children_key`, or equivalent (e.g. parent_id in schema, nested module in requirement.module).

**Key attributes to extract:** `tree_key` (node id), `parent_key` (parent id), `children_key` (children array key in response), `lazy`, `selectable`, `checkable`, `api_refs`.

### 2. Tree API (Operations)

**Condition**: Parsed `api_refs` points to operation(s) that return tree nodes (root list and optionally children by parent).

**Logic**: Derive request params (e.g. parent_id for lazy load) and response mapping (e.g. data.children, data.list) from the operation spec. Do not assume a fixed response shape.

### 3. Module/Route Topology (Optional)

**Condition**: Front-matter contains `spec: requirement.module` with nested structure (e.g. children modules).

**Logic**: When the product uses module topology as a tree (e.g. sidebar menu tree), route skill provides the tree data; this skill defines how to *render* a tree (expand/collapse, icons). For menu rendering, admin consumes route output; for a dedicated "module tree" or "org tree" page, this skill applies.

## Aesthetic & UX Standards (The "Official" Feel)

1. **Expand/Collapse**
   - Clear chevron or arrow; smooth expand/collapse (optional animation). Indentation or connector lines from parsed layout preference if present.
2. **Loading**
   - When lazy loading children, show spinner or skeleton at the expanding node; do not block the whole tree.
3. **Selection**
   - Selected/checked state visually distinct (e.g. primary color); when checkable with cascade, half-checked state for partial selection. Selected value(s) visible in form or summary as per pageform/pagelist.
4. **Empty**
   - Empty node or empty root: show placeholder text or "No data" per design system tone.

## Boundaries & Constraints

- **Tree Only**: You build tree views and tree selectors. Flat list/table is pagelist; form layout and submit are pageform. When a page is "list of items with no hierarchy," use pagelist, not this skill.
- **No Backend Logic**: Tree data comes from an HTTP backend (any language). This skill does not implement hierarchy storage; it only aligns request/response with the contract derived from spec.
- **Handoff**: Tree selector inside a form → pageform owns the form; this skill owns the tree control and binding rules. Standalone tree page or tree-table → this skill owns tree structure; pagelist owns table columns/actions if it is a tree-table hybrid.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM (e.g. tree component or hierarchy utils in WASM): use wasm-bindgen and shared types so that node shape and selection state are consistent between TS and WASM. This skill does not implement Rust/WASM code; it only considers the above when the tree view or tree selector embeds or calls WASM modules. Tree API calls are to an HTTP backend (any language); align request/response with that backend’s contract separately.

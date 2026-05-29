---
name: r2mo-ui-upload
description: Frontend: File and image upload, preview, and media binding from R2MO specs.
version: 1.0.0
tags: [r2mo, frontend, upload, media, file, image, attachment]
repository: internal
---

# Role: Frontend — Upload and Media

## Meta-Instruction

This skill targets frontend development. Outputs are Vue/React + TypeScript artifacts (upload components, preview/crop behavior, API bindings for upload) driven strictly by R2MO specification documents. You define the **rules** for when and how file/image fields are rendered, validated, and submitted. You do not build full forms or list pages; upload controls are embedded in forms (pageform) or referenced in list cells (pagelist). Your job is to ensure upload UX is consistent: accept rules, size/format limits, preview and crop behavior, and request/response alignment with the backend upload API. Drive all behavior from parsed note properties; do not hardcode field names or API paths.

## Note Properties (Front-Matter) Convention

All specifications referenced by this skill are carried in .md documents. **Each .md includes a YAML front-matter block (note properties) at the top.** Before using any spec, parse that document's front-matter and extract the relevant keys. Drive accept types, max size, preview/crop, and upload API refs strictly from these attributes. Keys most relevant here: `bind`, `api_refs`, `accept`, `max_size`, `max_count`, `preview`, `crop`; from schema: field type (file, image, url) and description. Do not rely on specific .md filenames or paths. Do not hardcode names like "avatar" or "attachment"; derive upload mode from parsed type and attributes (e.g. image + crop -> image upload with crop; file + accept -> document upload).

## Guiding Rules (Principle-First)

1. **Type → Control**
   - When the bound schema field type indicates file or image (or equivalent in your schema language), use an upload control, not a raw file input. Derive single vs multiple from parsed `max_count` or schema cardinality (e.g. array of files).
   - When the spec indicates image with `preview: true` or `crop`, provide thumbnail preview and optional crop UI; when it indicates generic file, provide list of filenames and size; when it indicates URL-only (e.g. existing media picker), provide link display and optional picker trigger.
2. **Constraints from Spec**
   - Accept list (e.g. `.jpg,.png`) and max size (e.g. 2MB) must come from parsed `accept` and `max_size` (or project-equivalent). Do not invent limits. If missing, document the gap and use a safe default only for prototyping.
3. **API Contract**
   - Upload endpoint and response shape (e.g. `url`, `id`, `name`) must be resolved from parsed `api_refs` or operation spec. Request body/form field names must match the backend contract. Do not hardcode `/upload` or field names like `file`.
4. **Integration**
   - In form context: upload control binds to form state like any other field; on submit, send either the uploaded URL/id or the file depending on backend contract (handled by pageform + this skill). In list context: display thumbnail or filename from schema; "Preview on Click" follows pagelist rules for images.

## Context Resolution (Pattern Recognition)

Do not rely on fixed paths or concrete names. Scan and parse any .md whose front-matter or linked schema indicates file/image/media—e.g. presence of `accept`, `max_size`, upload-related `api_refs`, or schema field type file/image (or project-equivalent).

### 1. Field Definition (Schema + Task)

**Condition**: Schema property type is file, image, or array of same; or task/design spec for a page or form includes upload-related attributes (`accept`, `max_size`, `preview`, `crop`).

**Key attributes to extract:** From schema: type, required, description. From spec: `accept`, `max_size`, `max_count`, `preview`, `crop`, `api_refs` (upload operation).

### 2. Upload Operation (API)

**Condition**: Parsed `api_refs` points to an operation that accepts multipart/form-data or binary body and returns a file identifier or URL.

**Logic**: Derive request method, field name for the file part, and response mapping (e.g. `data.url`, `data.id`) from the operation spec. Do not assume a fixed response shape.

### 3. Design System (Optional)

**Condition**: Front-matter contains `spec: design.system` (or equivalent).

**Key attributes:** `primary` for button/active state; consistent with theme for drag-over and error states.

## Aesthetic & UX Standards (The "Official" Feel)

1. **Feedback**
   - Show progress (percent or indeterminate) during upload. On success, show thumbnail or filename; on error, show message below control, not only a toast.
   - Drag-over state: clear visual change (border or background) using parsed `primary` or design token.
2. **Preview & Crop**
   - When `preview` is true for images: show thumbnail list with remove; optional "Preview on Click" in modal. When `crop` is true: after select, open crop UI (aspect from spec if present); output cropped file or URL per API contract.
3. **Accessibility**
   - Label and accept hint visible; errors associated with the control for screen readers.

## Boundaries & Constraints

- **Component Scope**: You define upload *components* and *binding rules*. Full form layout, other fields, and submit flow are the responsibility of pageform; list layout and cell rendering are pagelist. Hand off: this skill owns "how this field is an upload"; pageform owns "where it sits in the form and how it's submitted."
- **No Backend Logic**: Upload requests go to an HTTP backend (any language). This skill does not implement server-side storage; it only aligns request/response with the contract derived from spec.
- **No Standalone Upload Page**: If the product has a dedicated "media library" or "file manager" page, treat it as a list (pagelist) or custom view; this skill covers the upload *control* and its rules, not the full page.

## Rust / WebAssembly Frontend Context

In this project, **Rust** refers to **Rust-for-WebAssembly frontend** (e.g. Yew, Leptos, wasm-bindgen), not a backend. When the stack includes Rust/WASM (e.g. image crop or resize in WASM): use wasm-bindgen and shared types so that file metadata and upload result shapes are consistent between TS and WASM. This skill does not implement Rust/WASM code; it only considers the above when the upload flow embeds or calls WASM modules. The upload HTTP call is to a backend (any language); align request/response with that backend’s contract separately.

---
name: mo-dev-vue2css
description: Use when Vue SFC has large style block (>100 lines), styles unstyled after split, or "Cannot find module" errors on CSS imports
---

# Vue CSS Extraction

Extract CSS from Vue SFC `<style>` blocks to separate files. Core principle: **file extension must match template class usage**.

## When to Use

- Large `<style>` block (>100 lines)
- Styles appear unstyled after extraction
- Build error: "Cannot find module"
- Need to share styles across components

## Quick Workflow (Automated)

```bash
# Run from skill directory or provide full path
cd .claude/skills/mo-dev-vue2css

# Extract CSS automatically
./scripts/extract-css.sh /path/to/Component.vue

# Verify
cd /path/to/web && npm run build
```

**Script handles:**
- Detects `class` vs `:class="$style"` usage
- Chooses correct extension (`.css` or `.module.css`)
- Extracts CSS content
- Updates Vue file with import
- Preserves `scoped`/`module` attributes

## Manual Workflow (Fallback)

Use when script fails (multiple `<style>` blocks, mixed usage):

1. **Detect usage**: `./scripts/detect-class-usage.sh Component.vue`
   - Output: `plain-class`, `style-module`, `mixed`, or `no-class`
2. **Extract manually**: Copy CSS, create file with correct extension
3. **Update import**: `<style scoped src="./Component.css"></style>`
4. **Verify**: `npm run build` + browser test

## Quick Reference

| Template Uses | File Extension | Import |
|---------------|----------------|--------|
| `class="..."` | `.css` | `<style scoped src="./X.css">` |
| `:class="$style.x"` | `.module.css` | `<style module src="./X.module.css">` |
| Multiple blocks | `.scoped.css` + `.global.css` | Two imports (manual) |

## Common Mistakes

### Mistake 1: Wrong File Extension

**Problem**: Used `.module.css` when template uses plain classes

```vue
<!-- Template uses plain class -->
<div class="overview-page">...</div>

<!-- WRONG: .module.css triggers CSS Modules -->
<style scoped src="./Overview.module.css"></style>

<!-- CORRECT: Use .css -->
<style scoped src="./Overview.css"></style>
```

**Symptom**: Build passes but page looks unstyled

### Mistake 2: Missing Scoping Attribute

**Problem**: Forgot to preserve `scoped` or `module` attribute

```vue
<!-- WRONG: Lost scoped attribute -->
<style src="./Component.css"></style>

<!-- CORRECT: Preserve scoped -->
<style scoped src="./Component.css"></style>
```

**Symptom**: Styles leak to other components

### Mistake 3: Incorrect Import Path

**Problem**: Wrong relative path to CSS file

```vue
<!-- WRONG: Missing ./ prefix -->
<style scoped src="Component.css"></style>

<!-- CORRECT: Relative path -->
<style scoped src="./Component.css"></style>
```

**Symptom**: Build fails with "Cannot find module"

### Mistake 4: Skipping Verification

**Problem**: Assumed extraction worked without testing

**Fix**: ALWAYS run build and browser test after extraction

## Debugging Checklist

If page looks unstyled after extraction:

1. ✅ Check file extension: `.css` or `.module.css`?
2. ✅ Check template: plain `class` or `:class="$style"`?
3. ✅ Check import: `<style scoped src="./xxx.css"></style>`?
4. ✅ Check scoping: `scoped` or `module` attribute present?
5. ✅ Check build: `npm run build` passes?
6. ✅ Check browser: styles visible in DevTools?

## Examples

### Example 1: Simple Scoped Extraction

**Before**:
```vue
<template>
  <div class="card">
    <h2 class="title">Title</h2>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid #ddd;
  padding: 16px;
}

.title {
  font-size: 18px;
  font-weight: bold;
}
</style>
```

**After**:

`Component.vue`:
```vue
<template>
  <div class="card">
    <h2 class="title">Title</h2>
  </div>
</template>

<style scoped src="./Component.css"></style>
```

`Component.css`:
```css
.card {
  border: 1px solid #ddd;
  padding: 16px;
}

.title {
  font-size: 18px;
  font-weight: bold;
}
```

### Example 2: CSS Modules Extraction

**Before**:
```vue
<template>
  <div :class="$style.container">
    <span :class="$style.label">Label</span>
  </div>
</template>

<style module>
.container {
  display: flex;
}

.label {
  color: blue;
}
</style>
```

**After**:

`Component.vue`:
```vue
<template>
  <div :class="$style.container">
    <span :class="$style.label">Label</span>
  </div>
</template>

<style module src="./Component.module.css"></style>
```

`Component.module.css`:
```css
.container {
  display: flex;
}

.label {
  color: blue;
}
```

### Example 3: Multiple Style Blocks

**Before**:
```vue
<template>
  <div class="local">
    <div class="global">...</div>
  </div>
</template>

<style scoped>
.local {
  padding: 10px;
}
</style>

<style>
.global {
  margin: 0;
}
</style>
```

**After**:

`Component.vue`:
```vue
<template>
  <div class="local">
    <div class="global">...</div>
  </div>
</template>

<style scoped src="./Component.scoped.css"></style>
<style src="./Component.global.css"></style>
```

`Component.scoped.css`:
```css
.local {
  padding: 10px;
}
```

`Component.global.css`:
```css
.global {
  margin: 0;
}
```

## Integration with ft-webos

When working in ft-webos project:

1. **Check CLAUDE.md first**: Review project-specific CSS conventions
2. **Follow existing patterns**: Check how other components handle CSS
3. **Verify theme compatibility**: Ensure extracted CSS works with all themes
4. **Test in all themes**: macOS, Windows, Linux themes
5. **Update memory**: Document any project-specific patterns learned

## Workflow Summary

```
1. Read Vue SFC
2. Analyze template class usage (plain vs $style)
3. Determine file extension (.css vs .module.css)
4. Extract CSS content to new file
5. Update SFC with external import
6. Preserve scoping attributes (scoped/module)
7. Run npm run build
8. Test in browser
9. Verify styles render correctly
```

## Success Criteria

- ✅ Build passes with no errors
- ✅ Styles render correctly in browser
- ✅ No visual regressions
- ✅ File extension matches template usage
- ✅ Scoping preserved (no style leaks)
- ✅ Import path correct

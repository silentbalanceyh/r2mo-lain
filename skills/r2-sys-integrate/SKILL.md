---
name: r2-sys-integrate
description: Integrate all developed components into a complete system with menu-driven routing
version: 1.0.0
tags: [r2mo, system, integration, routing, menu, frontend-assembly]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-sys-integrate

Integrate all developed UI components, pages, and modules into a complete, production-ready system. Establish menu-driven routing, integrate global state management, and ensure seamless navigation across all modules.

## Role
Frontend System Architect - Assemble and integrate all components into a cohesive application system with menu-driven navigation.

## Scope

### ✅ In Scope
- Menu-driven routing system (from menu.yaml in each module)
- Module integration into pages structure
- Global state management setup
- Context and provider configuration
- Layout and navigation components
- Type definitions and constants aggregation
- Application entry point (app.rs) and root layout
- Route registration and dynamic navigation
- Global style configuration
- Tailwind CSS theming integration

### ❌ Not in Scope
- Creating new pages or components (use r2-dev-page for this)
- Backend API implementation
- Database operations
- Authentication/authorization logic
- Individual page functionality (already implemented)

## Input

### Required Files
- **Module Structure**: All modules in `src/pages/{module}/`
  - Each module contains `menu.yaml` (menu definitions)
  - Each module contains page directories (e.g., `{page}/`)
  - Each page contains generated code from r2-dev-page

- **Project Configuration**:
  - `.r2mo/requirements/project.md` - Tech stack definition
  - `.r2mo/design/spec.md` - Design system and theming
  - `.r2mo/api/metadata.yaml` - API definitions (for integration context)

- **Source Files**:
  - `src/app.rs` - Current root component (to be updated)
  - `src/pages/mod.rs` - Page module registry (to be expanded)
  - `src/components/layout.rs` - Main layout component
  - `src/context/mod.rs` - Global state context
  - `src/models/mod.rs` - Global data models
  - `tailwind.config.js` - Styling configuration

### Optional Files
- `.cursor/rules/*.mdc` - Architecture rules and patterns
- Project documentation for architectural guidelines

## Output

### File Modifications/Creations

#### 1. **src/pages/mod.rs** - Module Registry
- Register all modules from `src/pages/{module}/`
- Use `pub mod {module};` declarations
- Include conditional compilation if needed
- Add module metadata comments

#### 2. **src/pages/{module}/mod.rs** - Module Integration
- For each module, create/update `mod.rs` with:
  - Page route definitions (from menu.yaml)
  - Page component imports
  - Route configuration matching menu URIs
  - Leptos Router Route components

#### 3. **src/app.rs** - Root Application
- Update router configuration
- Add dynamic route handling based on menu.yaml
- Include module route registration
- Maintain global layout wrapper
- Support nested routing for module pages

#### 4. **src/components/layout.rs** - Main Layout Component
- Update/create layout with:
  - Navigation menu rendering (from menu.yaml)
  - Outlet for page content
  - Header, sidebar, footer structure
  - Menu state management
  - Active route highlighting
  - User context (if applicable)

#### 5. **src/context/mod.rs** - Global State
- Aggregate all module contexts
- Create global app state provider
- Menu state (current active menu item)
- Global navigation context
- User/auth context (if applicable)

#### 6. **src/models/mod.rs** - Type Definitions
- Aggregate all entity types from modules
- Create global type definitions
- Menu item type (from menu.yaml structure)
- Navigation types
- Route parameters

#### 7. **tailwind.config.js** - Theme Configuration
- Integrate design system from spec.md
- Include all color schemes, typography, spacing
- Configure component classes if using Tailwind plugins
- Ensure consistency across all pages

#### 8. **Route Documentation** - ROUTES.md (Optional)
- Document all routes from menu.yaml
- Create route map for reference
- List page locations and requirements
- Parameter documentation

## Process

### 1. Analyze Menu Structure

```
For each module in src/pages/{module}/
  Read: menu.yaml
  Extract:
    - Module menu items (parentId: null)
    - Sub-menu items (parentId: module-id)
    - URI paths for each menu item
    - Menu hierarchy and order
    - Icons and display names
```

### 2. Validate Existing Code

```
Check all modules:
  - Page components exist in matching directories
  - Code generated from r2-dev-page is present
  - Type definitions are available
  - State management hooks/stores are ready
  - API clients are integrated
```

### 3. Register Modules

```
Update: src/pages/mod.rs
  - Import each module: pub mod {module};
  - Create public re-exports if needed
  - Add documentation

Create/Update: src/pages/{module}/mod.rs
  - Import all page components
  - Define route structure matching menu.yaml
  - Create Leptos Route definitions
```

### 4. Build Route Tree

```
For each module:
  Create route structure:
    /module-path (outlet for sub-pages)
      /{page-path} (page components)
        /{page-path}/{sub-path} (nested routes if applicable)
  
  Map URIs from menu.yaml exactly to routes
```

### 5. Update App Router

```
File: src/app.rs
  - Register all module routes
  - Set up route nesting
  - Add layout wrapper
  - Implement dynamic routing if needed
  - Configure error handling
```

### 6. Create/Update Layout

```
File: src/components/layout.rs
  - Render menu from menu.yaml
  - Implement navigation links
  - Add outlet for page content
  - Connect menu to route changes
  - Style per design system
```

### 7. Aggregate Global State

```
File: src/context/mod.rs
  - Create MenuContext (current selected menu item)
  - Aggregate all module contexts
  - Create AppStateProvider
  - Handle state initialization
```

### 8. Create Type Definitions

```
File: src/models/mod.rs
  - Define MenuItem type from menu.yaml
  - Aggregate all entity types from modules
  - Define navigation types
  - Create route parameter types
```

### 9. Verify Integration

```
Validation:
  - All routes from menu.yaml are registered
  - All pages are accessible via routes
  - Navigation works correctly
  - State flows properly through app
  - Styling is consistent
  - No missing dependencies
```

## Rules

### Mandatory Rules

1. **Menu-Driven Routing**
   - MUST use menu.yaml as single source of truth for routes
   - Route paths MUST match menu.yaml URI exactly
   - Menu items define all accessible pages
   - No hardcoded routes outside menu.yaml

2. **Module Structure Compliance**
   - MUST respect existing module directory structure
   - MUST not move or rename existing pages/modules
   - MUST preserve all generated code from r2-dev-page
   - Module organization from menu.yaml MUST be preserved

3. **Route Registration**
   - MUST register all modules in src/pages/mod.rs
   - MUST create Route components for each menu item
   - MUST maintain route path consistency with URIs
   - MUST handle nested routes correctly in Leptos Router

4. **Type Safety**
   - MUST define types for all menu items
   - MUST use type-safe route parameters
   - MUST create proper type definitions for navigation
   - MUST maintain consistency with generated page types

5. **State Management**
   - MUST aggregate all contexts properly
   - MUST avoid prop drilling (use Context API)
   - MUST initialize global state at root level
   - MUST provide state to all child components

6. **Design System**
   - MUST use spec.md for all styling
   - MUST apply Tailwind CSS consistently
   - MUST implement responsive design
   - MUST use design tokens (colors, typography, spacing)

7. **Framework Compliance**
   - MUST use Leptos patterns and conventions
   - MUST use Leptos Router for routing
   - MUST follow Rust 2024 edition patterns
   - MUST compile without warnings

8. **Documentation**
   - MUST document all routes
   - MUST explain module structure
   - MUST include type definitions
   - MUST provide integration guide

## Integration Patterns

### Route Definition from menu.yaml

```
menu.yaml structure:
- id: "module-id"
  uri: "/tenant/manage-list"
  name: "tenant.manage.list"
  
Leptos Route equivalent:
<Route path=path!("/tenant/manage-list") 
        view=|| view! { <TenantManageListPage/> } />
```

### Menu Item Type Definition

```rust
#[derive(Clone, Debug, PartialEq)]
pub struct MenuItem {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub text: String,
    pub uri: String,
    pub icon: Option<String>,
    pub level: u32,
    pub order: u32,
}
```

### Context for Menu State

```rust
#[derive(Clone)]
pub struct MenuContext {
    pub current_menu_id: RwSignal<Option<String>>,
    pub expanded_menu: RwSignal<Vec<String>>,
    pub menu_items: RwSignal<Vec<MenuItem>>,
}
```

### Route in Nested Module

```rust
// src/pages/tenant/mod.rs
pub fn TenantRoutes() -> impl IntoView {
    view! {
        <Route path=path!("/manage-list") 
                view=|| view! { <ManageListPage/> } />
        <Route path=path!("/manage-audit") 
                view=|| view! { <ManageAuditPage/> } />
    }
}

// src/app.rs
<Route path=path!("/tenant/*") view=|| view! { <TenantRoutes/> } />
```

## Validation Checklist

- [ ] All modules listed in src/pages/ are registered
- [ ] All menu.yaml files are parsed and understood
- [ ] All URIs from menu.yaml are converted to routes
- [ ] All routes are accessible via Leptos Router
- [ ] All pages are imported and visible
- [ ] Navigation between pages works correctly
- [ ] Menu highlighting reflects current route
- [ ] Layout is applied to all pages
- [ ] Global state initializes correctly
- [ ] Design system is applied consistently
- [ ] No unused imports or dead code
- [ ] Compilation succeeds without warnings
- [ ] All type definitions are correct
- [ ] Error handling is in place
- [ ] Documentation is complete

## Success Criteria

- ✅ All modules integrated into routing system
- ✅ Menu-driven navigation fully functional
- ✅ All pages accessible via correct routes
- ✅ Global state management working
- ✅ Consistent styling across system
- ✅ Type-safe route handling
- ✅ Proper context propagation
- ✅ Module structure preserved
- ✅ No missing pages or routes
- ✅ Application compiles and runs
- ✅ Menu reflects current navigation
- ✅ All design tokens applied
- ✅ Responsive layout working
- ✅ Code follows framework conventions
- ✅ Documentation complete

## Common Integration Patterns

### Pattern 1: Module with Multiple Pages

```
/src/pages/tenant/
├── menu.yaml (defines all tenant routes)
├── mod.rs (registers all pages)
├── manage-list/
│   └── (page components from r2-dev-page)
├── manage-audit/
│   └── (page components from r2-dev-page)
└── manage-config/
    └── (page components from r2-dev-page)
```

### Pattern 2: Route Structure in app.rs

```rust
<Route path=path!("/tenant/*") view=|| view! { 
    <TenantModuleRoutes/>
} />
```

### Pattern 3: Dynamic Menu Rendering

```rust
pub fn NavigationMenu() -> impl IntoView {
    let menu_items = use_context::<MenuContext>()
        .expect("MenuContext")
        .menu_items;
    
    view! {
        <For each=move || menu_items.get()
             key=|item| item.id.clone()
             children=|item| view! {
                 <a href=item.uri>{item.text}</a>
             }
        />
    }
}
```

## Architecture Diagram

```
src/app.rs (Root)
├── Router
│   ├── Route (/)
│   │   └── LoginPage
│   └── Route (/*any)
│       └── AppLayout
│           ├── Navigation (from menu.yaml)
│           └── Outlet (page content)
│               ├── Module Routes
│               │   ├── page1
│               │   ├── page2
│               │   └── page3
│               └── Other Routes

MenuContext (Global State)
├── current_menu_id
├── expanded_menu
└── menu_items

Module Structure
├── /src/pages/module1/
│   ├── menu.yaml
│   ├── mod.rs
│   └── pages/
├── /src/pages/module2/
│   ├── menu.yaml
│   ├── mod.rs
│   └── pages/
└── /src/pages/module3/
    ├── menu.yaml
    ├── mod.rs
    └── pages/
```

## Related Skills

- **r2-req-module** - Module requirements definition
- **r2-req-page** - Page specifications
- **r2-dev-html** - HTML design mockups
- **r2-dev-page** - Page code generation

All these skills output is consumed and integrated by this skill into a complete system.

## Troubleshooting

### Issue: Route not found
**Solution**: Verify menu.yaml URI matches route path exactly. Check Route definitions in mod.rs.

### Issue: Menu not highlighting current page
**Solution**: Ensure MenuContext is updated when route changes. Use Leptos Router hooks to detect navigation.

### Issue: Missing page component
**Solution**: Verify page was generated by r2-dev-page. Check if component is imported in module's mod.rs.

### Issue: Style inconsistency
**Solution**: Verify tailwind.config.js includes all design tokens. Check if design/spec.md is fully applied.

### Issue: State not propagating
**Solution**: Ensure MenuContext is provided at root level. Check context dependencies and dependencies.

## Version

- **Version**: 1.0.0
- **Last Updated**: 2026-02-07
- **Status**: Production Ready
- **Framework**: Leptos 0.8.15 + Leptos Router 0.8.11
- **Language**: Rust 2024 Edition


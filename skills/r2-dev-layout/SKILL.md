---
name: r2-dev-layout
description: Develop main application layout/template with menu-driven navigation
version: 1.0.0
tags: [r2mo, dev, layout, template, navigation, menu, frontend]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-dev-layout

Develop the main application layout template (`src/components/layout.rs`). This layout provides global navigation, menu, and page container for all authenticated users and business modules.

## Role
Frontend Developer - Create application-wide layout, navigation system, and menu management.

## Scope

### ✅ In Scope
- Top navigation bar (system title, user info, logout button)
- Left sidebar menu (dynamic from menu.yaml, collapsible)
- Main content area (page outlet)
- User profile display and dropdown
- Logout functionality
- Menu highlighting based on current route
- Responsive design (desktop/tablet/mobile)
- Menu state management
- Navigation state tracking

### ❌ Not in Scope
- Individual page implementation (separate r2-dev-page)
- User profile editing (separate page)
- System settings (separate page)
- API implementation (backend only)
- Authentication logic (handled in r2-dev-login)

## Input

### Required Files
- **Menu Definitions** - All module `menu.yaml` files
    - Menu items with URIs
    - Menu hierarchy (parent/child)
    - Icons, display names, order
    - Menu levels and organization

- **Application Context** - AppContext definition
    - User information (name, avatar, email)
    - Authentication state (is_logged_in)
    - User permissions/roles
    - System configuration

- **Current Layout** - Existing `src/components/layout.rs`
    - Current structure (may be skeleton)
    - Component pattern
    - Styling approach

- **Design System** - `.r2mo/design/spec.md`
    - Color scheme
    - Typography
    - Spacing and grid
    - Responsive breakpoints
    - Component styles

- **Project Configuration** - `.r2mo/requirements/project.md`
    - Tech stack (Leptos, Tailwind)
    - Design system name
    - Authentication approach

## Output

### File: `src/components/layout.rs`

**Structure**:
```rust
// AppLayout component (main layout)
// Navigation component (header/topbar)
// MenuItem struct (from menu.yaml)
// Sidebar component (menu navigation)
// UserProfile component (user info dropdown)
// Routing with Outlet
```

**Key Components**:
1. **Sidebar** (Left navigation)
    - Menu items from menu.yaml
    - Collapsible (w-64 expanded, w-20 collapsed)
    - Current item highlighting
    - Icon and text display

2. **TopBar** (Header navigation)
    - System title/logo
    - Breadcrumb or current page title
    - User info (name, avatar)
    - Settings/logout dropdown

3. **Content Area** (Main)
    - Leptos Router Outlet (page content)
    - Proper spacing and responsive padding
    - Full height container

4. **Menu Management**
    - Sidebar toggle button
    - Active menu highlighting
    - Menu state persistence (optional)

## Process

### 1. Parse Menu Definitions

```
Input: All modules' menu.yaml files
Extract:
  - Root menu items (level 1, parentId: null)
  - Sub-menu items (level 2, parentId: module-id)
  - URIs for routing
  - Icons and display names
  - Menu hierarchy and order
  - Permissions (if available)
```

### 2. Define MenuItem Structure

```rust
#[derive(Clone, Debug)]
pub struct MenuItem {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub text: String,
    pub uri: String,
    pub icon: Option<String>,
    pub level: u32,
    pub order: u32,
    pub children: Vec<MenuItem>,
}
```

### 3. Build Menu Tree

```
Process menu items:
  1. Load all menu items from menu.yaml files
  2. Build hierarchical structure (parent/children)
  3. Sort by level and order
  4. Prepare for rendering
```

### 4. Implement Sidebar Component

```
Sidebar features:
  - Display menu items hierarchically
  - Collapse/expand with animation
  - Show icons and labels
  - Highlight current path
  - Support nested levels (2+ levels)
  - Toggle button
```

### 5. Implement TopBar Component

```
TopBar features:
  - System logo/title
  - Current page title (optional)
  - User name and avatar
  - Dropdown menu (profile, settings, logout)
  - Logout handler
```

### 6. Implement Menu Highlighting

```
Route tracking:
  1. Use use_location() from leptos_router
  2. Get current pathname
  3. Compare with menu items' URIs
  4. Highlight matching menu item
  5. Expand parent menu items
  6. Update on route change
```

### 7. Implement Responsive Design

```
Desktop (lg+):
  - Full sidebar (w-64)
  - Top navigation
  - Content area takes remaining space

Tablet (md):
  - Collapsible sidebar (toggle)
  - Top navigation
  - Responsive padding

Mobile (sm):
  - Sidebar drawer (hidden by default)
  - Top navigation with menu button
  - Full-width content
```

### 8. Implement User Dropdown

```
User dropdown menu:
  - Display user name
  - Profile link (optional)
  - Settings link (optional)
  - Logout button
  - Handle logout (clear AppContext, navigate to login)
```

## Rules

### Mandatory Rules

1. **Menu Source of Truth**
    - All menu items MUST come from menu.yaml files
    - No hardcoded menu items
    - Support dynamic menu loading
    - Respect menu hierarchy from YAML

2. **Route Synchronization**
    - Menu URI MUST match Leptos Router paths exactly
    - Highlight current menu based on pathname
    - Support nested routes
    - Update highlighting on navigation

3. **AppContext Integration**
    - Read user info from AppContext
    - Read authentication state from AppContext
    - Update AppContext on logout
    - Respect user permissions (if available)

4. **Responsive Design**
    - Desktop: Sidebar w-64, full menu text
    - Tablet: Sidebar w-20 or hidden, menu toggle
    - Mobile: Sidebar as drawer, hidden by default
    - Use Tailwind responsive classes

5. **Styling Compliance**
    - Use colors from spec.md
    - Apply typography from design system
    - Responsive spacing and padding
    - Use Tailwind CSS exclusively
    - Respect component styles from spec.md

6. **State Management**
    - Use signals for sidebar state (open/close)
    - Use Context API for menu state
    - Avoid prop drilling
    - State should be accessible to all child components

7. **Performance**
    - Menu renders efficiently (avoid re-renders)
    - Outlet loads pages on demand
    - Lazy load menu items if > 100 items
    - Use For component for menu list rendering

## Implementation Patterns

### Sidebar Toggle

```rust
let (sidebar_open, set_sidebar_open) = signal(true);

view! {
    <aside class=move || {
        if sidebar_open.get() {
            "w-64"
        } else {
            "w-20"
        }
    }>
        // Menu items
    </aside>
    <button on:click=move |_| set_sidebar_open.update(|v| *v = !*v)>
        "Toggle"
    </button>
}
```

### Current Route Highlighting

```rust
let location = use_location();
let current_path = move || location.pathname.get();

view! {
    <For each=move || menu_items.clone()
         key=|item| item.id.clone()
         children=move |item| {
            let is_active = move || current_path() == item.uri;
            view! {
                <a
                    href=&item.uri
                    class=move || {
                        if is_active() {
                            "bg-blue-600 text-white"
                        } else {
                            "hover:bg-gray-100"
                        }
                    }
                >
                    {item.text.clone()}
                </a>
            }
        }
    />
}
```

### User Dropdown

```rust
let handle_logout = {
    let app_context = app_context.clone();
    let navigate = navigate.clone();
    move |_| {
        app_context.set_is_logged_in.set(false);
        app_context.set_user_name.set(String::new());
        navigate("/", Default::default());
    }
};

view! {
    <button on:click=handle_logout>
        "Logout"
    </button>
}
```

## Validation Checklist

- [ ] All menu items from menu.yaml files loaded
- [ ] Menu hierarchy rendered correctly
- [ ] Current route highlighted in menu
- [ ] Sidebar toggle working smoothly
- [ ] User info displayed from AppContext
- [ ] Logout functionality working
- [ ] Responsive design tested (mobile/tablet/desktop)
- [ ] Tailwind classes applied correctly
- [ ] No hardcoded menu items
- [ ] No hardcoded routes
- [ ] Icons displayed properly
- [ ] Typography from spec.md applied
- [ ] Colors from spec.md applied
- [ ] Loading performance acceptable
- [ ] Accessibility features included

## Success Criteria

- ✅ Layout compiles without errors
- ✅ Sidebar displays all menu items from menu.yaml
- ✅ Menu highlighting matches current route
- ✅ Sidebar toggle works smoothly
- ✅ User info displays correctly
- ✅ Logout works (clears auth, returns to login)
- ✅ Responsive design on all devices
- ✅ Design system fully applied
- ✅ Routes from menu.yaml match Router definitions
- ✅ AppContext integration complete
- ✅ Menu hierarchy rendered correctly
- ✅ Icons display properly
- ✅ No console errors
- ✅ Performance is acceptable
- ✅ UX is smooth and intuitive

## Layout Structure Diagram

```
┌─────────────────────────────────────┐
│  TopBar (Header)                    │
│  Logo | Title | User | Logout       │
├─────────┬─────────────────────────┤
│         │                         │
│ Sidebar │  Content Area           │
│ (Menu)  │  (Outlet)               │
│         │  [Current Page]         │
│         │                         │
│         │                         │
└─────────┴─────────────────────────┘
```

## Related Skills
- **r2-dev-login** - Login page (entry point)
- **r2-dev-page** - Individual page development
- **r2-sys-integrate** - System integration and routing

## Version

- **Version**: 1.0.0
- **Last Updated**: 2026-02-07
- **Status**: Production Ready
- **Framework**: Leptos 0.8.15 + Leptos Router
- **Language**: Rust 2024 Edition


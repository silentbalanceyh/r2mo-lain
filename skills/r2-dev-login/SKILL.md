---
name: r2-dev-login
description: Develop comprehensive authentication module supporting 8+ enterprise-grade login methods including OAuth2/OIDC, with flexible selection based on requirements
version: 1.2.1
tags: [r2mo, dev, login, auth, authentication, jwt, ldap, oauth, oauth2, oidc, sms, email, wechat, wecom]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# r2-dev-login

Develop the authentication module (`src/pages/login.rs`) as the application entry point. Support multiple enterprise-grade authentication methods, but implement only the methods specified in `requirement.page.md` - not all systems need all authentication types.

## Role
Frontend Developer - Implement flexible, multi-method authentication system tailored to project requirements.

## Scope

### ✅ In Scope
- Multiple authentication methods (8+ login types)
- Standard OAuth2/OIDC protocol support
- Form validation (client-side and server validation)
- Error handling and user feedback
- Authentication API integration (`/auth/**` and `/oauth2/**` endpoints)
- Token management (JWT + Access Token)
- AppContext integration (user state)
- Verification code workflows (SMS/Email countdown)
- QR code scanning flows (WeChat/WeCom)
- Callback handling (OAuth2/third-party OAuth)
- Responsive design across all devices

### ❌ Not in Scope
- Backend authentication implementation
- OAuth provider setup
- User registration/password reset
- Two-factor authentication (separate feature)
- SSO configuration
- LDAP server setup

## Supported Authentication Methods

### Available Methods (Choose Based on Requirements)
**NOT all systems need all methods** - implement only what `requirement.page.md` specifies.

### 1. Standard Username/Password (`/auth/login`)
- **When to use**: Almost all systems (essential baseline)
- Basic credential-based authentication
- Fallback method for all configurations
- **Complexity**: Low | **Priority**: High

### 2. JWT Login (`/auth/jwt-login`)
- **When to use**: Modern apps, stateless API-first architectures
- Enhanced JWT-based authentication
- **Complexity**: Low | **Priority**: Medium

### 3. LDAP Enterprise Directory (`/auth/ldap-login`)
- **When to use**: Enterprise/government systems ONLY
- Integration with corporate LDAP directory
- **Complexity**: Medium | **Priority**: Low (enterprise only)

### 4. SMS Verification Code (`/auth/sms-login` + `/auth/sms-send`)
- **When to use**: Mobile-first apps, 2FA required, users prefer phone
- **Complexity**: High (polling, countdown) | **Priority**: Medium

### 5. Email Verification Code (`/auth/email-login` + `/auth/email-send`)
- **When to use**: Email-first apps, SaaS, cost-effective verification
- **Complexity**: Medium (countdown) | **Priority**: Medium

### 6. WeChat Public Account (`/auth/wechat-qrcode` + `/auth/wechat-status` + `/auth/wechat-callback`)
- **When to use**: China-only applications
- **Complexity**: High (QR code, polling) | **Priority**: Low (region-specific)

### 7. Enterprise WeChat (WeCom) (`/auth/wecom-init` + `/auth/wecom-login` + `/auth/wecom-qrcode`)
- **When to use**: Enterprise internal applications ONLY
- **Complexity**: High (OAuth2, QR code) | **Priority**: Low (internal only)

### 8. OAuth2/OIDC Standard Protocol (`/oauth2/token`, `/oauth2/revoke`, `/userinfo`)
- **When to use**: SaaS platforms, multi-tenant systems, need standard protocol
- **Complexity**: High (OAuth2 flow, token management) | **Priority**: Medium-High

## Authentication Method Selection Guide

### Minimal Configuration (Startups/Small Apps)
```
Required:
  - Standard Username/Password
Optional:
  - Email Verification (for user validation)
Not needed: LDAP, SMS, WeChat, WeCom, OAuth2
```

### Standard Configuration (Mid-Size Apps)
```
Required:
  - Standard Username/Password
  - JWT (for API consistency)
Optional:
  - Email or SMS verification
  - OAuth2 (if multi-tenant)
Not needed: LDAP, WeChat, WeCom
```

### Enterprise Configuration (Enterprises/Government)
```
Required:
  - LDAP Enterprise Directory
  - Standard Username/Password (fallback)
Optional:
  - OAuth2/OIDC (for SSO)
  - SMS verification
Not needed: WeChat, WeCom (unless internal use)
```

### China-Focused Local Apps
```
Required:
  - Standard Username/Password
  - WeChat Login (mass-market appeal)
Optional:
  - WeCom (if B2B)
  - SMS Verification
Not needed: LDAP, OAuth2 standard (use WeChat instead)
```

### SaaS/Platform Apps
```
Required:
  - OAuth2/OIDC (standard protocol)
  - Standard Username/Password (fallback)
Optional:
  - Social login integrations
  - JWT (for API)
Not needed: LDAP, SMS, WeChat (unless specific regions)
```

## Input

### Critical Step: Identify Required Methods
```
Read: requirement.page.md
Identify:
  - Which authentication methods are specified?
  - Is it enterprise (LDAP needed)?
  - Is it China-focused (WeChat/WeCom)?
  - Is it SaaS/platform (OAuth2)?
  - What's the user base (mobile = SMS, email = Email)?
  
Rule: IMPLEMENT ONLY what requirement.page.md specifies
      DO NOT add methods not explicitly required
```

### Required Files
- `requirement.page.md` - Authentication requirements
    - Supported login methods including OAuth2 provider list
    - Enterprise configuration (LDAP, WeChat, WeCom, OAuth2 apps)
    - Form fields per method
    - Security requirements

- `.r2mo/api/metadata.yaml` - API definitions under `/auth/**` and `/oauth2/**`
    - All authentication endpoints
    - OAuth2/OIDC endpoints (`/oauth2/token`, `/oauth2/revoke`, `/userinfo`)
    - Request/response schemas
    - Error codes and messages
    - Field requirements

- `.r2mo/api/marker.md` - Field attributes
    - Field type (text, password, phone, email)
    - Validation rules (length, format, required)
    - Display properties
    - Error messages

- `.r2mo/design/spec.md` - Design system
    - Login page background and styling
    - Form component styles
    - Button styles
    - Color scheme
    - Responsive design

- Project Configuration
    - `.r2mo/requirements/project.md` - Tech stack
    - OAuth2 provider credentials (app ID, client secret, etc.)

## Output

### File: `src/pages/login.rs`

**Structure**:
```rust
// ...existing code...
// AuthMethod enum (8+ variants including OAuth2)
// Signal states per method
// OAuth2 authorization flow implementation
// Token exchange handling
// User info retrieval
// Token revocation
// ...existing code...
```

## Process

### 0. Determine Scope Based on Requirements (CRITICAL)

```
Before starting any implementation:

1. Read requirement.page.md carefully
2. Identify which authentication methods are listed
3. Create a scope document showing:
   - Required methods (MUST implement)
   - Optional methods (implement if requested)
   - Not applicable methods (skip completely)

Example scope:
  ✅ Required: Standard Login, JWT, Email Verification
  ⚠️  Optional: SMS Verification (if budget allows)
  ❌ Skip: LDAP, WeChat, WeCom, OAuth2 (not needed for this app)

Implementation rule:
  - Implement EXACTLY what requirement.page.md specifies
  - Do NOT assume all methods are needed
  - Do NOT implement methods "just in case"
  - Complexity and cost scales with number of methods
```

### 1-2. [Previous Steps - Standard, JWT, LDAP methods]

### [Steps continue for required methods only, skip others]

```
OAuth2 Authorization Code Flow:
  1. User clicks "Sign in with {Provider}"
  2. Redirect to provider's authorization endpoint
  3. User approves permissions
  4. Provider redirects back with authorization code
  5. Exchange code for tokens via /oauth2/token
  6. Retrieve user info via /userinfo with access token
  7. Store tokens (access_token, id_token, refresh_token)
  8. Update AppContext with user information
  9. Navigate to home page
```

### 9. Implement Token Management for OAuth2

```
Token Storage:
  - access_token: Used for API requests (Authorization: Bearer header)
  - id_token: Contains user information (JWT format, optional decode)
  - refresh_token: Used to obtain new access token when expired
  
Token Refresh:
  - Monitor access token expiry
  - Call /oauth2/token with refresh_token before expiry
  - Update stored tokens
  - Transparently continue user session
  
Token Revocation:
  - On logout: POST to /oauth2/revoke with access_token
  - Clear all stored tokens from client
  - Redirect to login page
```

### 10. Implement /userinfo Endpoint Usage

```
After OAuth2 token exchange:
  GET /userinfo
  Header: Authorization: Bearer {access_token}
  
Response contains user profile:
  - User ID
  - Name, email
  - Avatar/photo URL
  - Roles/permissions
  - Other OIDC claims
  
Update AppContext:
  - Set is_logged_in: true
  - Store user info
  - Store permissions
```

## Rules

### [Previous Rules 1-9 from v1.1.0]

### 10. OAuth2/OIDC Compliance
- Implement Authorization Code flow (most secure for web)
- PKCE support if required (RFC 7636)
- Validate state parameter to prevent CSRF
- Handle error responses from OAuth2 provider
- Secure storage of refresh_token (if sensitive data)

### 11. Token Lifecycle Management
- Store access_token securely (localStorage acceptable for web SPA)
- Monitor expiry time (exp claim in JWT or response expires_in)
- Implement refresh_token rotation if provider supports
- Clear tokens on logout or session timeout
- Handle token revocation response

### 12. User Information Integration
- Retrieve user profile from /userinfo endpoint
- Map OAuth2 claims to AppContext fields
- Cache user info appropriately
- Handle missing optional fields gracefully

## Implementation Patterns

### [Previous patterns from v1.1.0]

### OAuth2 Authorization Initialization

```rust
let handle_oauth2_signin = |provider: String| {
    let state = generate_random_state(); // CSRF protection
    let authorize_url = format!(
        "{}?client_id={}&redirect_uri={}&scope={}&state={}",
        provider.authorize_endpoint,
        config.client_id,
        config.redirect_uri,
        "openid profile email",
        state
    );
    // Store state in sessionStorage for validation
    window.session_storage().set_item("oauth_state", &state);
    // Redirect to provider
    window.location().set_href(&authorize_url);
};
```

### OAuth2 Token Exchange

```rust
let handle_oauth2_callback = {
    let set_error_message = set_error_message.clone();
    let set_loading = set_loading.clone();
    move |code: String, state: String| {
        // Validate state
        let stored_state = window.session_storage().get_item("oauth_state");
        if stored_state != Some(state.clone()) {
            set_error_message.set("Invalid state parameter - possible CSRF attack".to_string());
            return;
        }
        
        spawn_local(async move {
            set_loading.set(true);
            match exchange_oauth2_token(&code).await {
                Ok(token_response) => {
                    // Store tokens
                    store_oauth_tokens(&token_response);
                    // Get user info
                    match get_user_info(&token_response.access_token).await {
                        Ok(user_info) => {
                            update_app_context(&user_info);
                            navigate_to_home();
                        },
                        Err(e) => set_error_message.set(e.to_string()),
                    }
                },
                Err(e) => set_error_message.set(e.to_string()),
            }
            set_loading.set(false);
        });
    }
};
```

### Token Refresh Handler

```rust
let refresh_token_if_needed = async {
    if let Some(exp_time) = get_token_expiry() {
        if is_expiring_soon(exp_time) {
            match refresh_access_token().await {
                Ok(new_tokens) => {
                    update_stored_tokens(&new_tokens);
                },
                Err(_) => {
                    // Token refresh failed - logout user
                    logout();
                    navigate_to_login();
                }
            }
        }
    }
};
```

## Validation Checklist

- [ ] [Previous items from v1.1.0]
- [ ] OAuth2/OIDC endpoints (/oauth2/token, /oauth2/revoke, /userinfo) properly integrated
- [ ] Authorization code flow implemented correctly
- [ ] State parameter generated and validated (CSRF protection)
- [ ] Token exchange working (code → access_token)
- [ ] User info retrieval working (/userinfo)
- [ ] Tokens stored securely
- [ ] Token refresh implemented (if needed)
- [ ] Token revocation on logout
- [ ] OAuth2 error responses handled
- [ ] Redirect URI matches provider configuration
- [ ] Scope permissions correct (openid, profile, email)
- [ ] PKCE implemented (if required)

## Success Criteria

- [Previous items from v1.1.0]
- ✅ OAuth2/OIDC fully integrated
- ✅ Authorization code flow complete
- ✅ Token exchange working
- ✅ User profile retrieved and displayed
- ✅ Token refresh working (if multi-session required)
- ✅ Token revocation on logout
- ✅ CSRF protection (state parameter)
- ✅ Error handling for OAuth2 flows
- ✅ Multi-provider support (if required)

## Related Skills
- **r2-dev-layout** - Main application layout with authenticated user
- **r2-dev-page** - Regular page development
- **r2-sys-integrate** - System integration with login page routing

## Version

- **Version**: 1.2.0 (Added OAuth2/OIDC support)
- **Last Updated**: 2026-02-07
- **Status**: Production Ready
- **Framework**: Leptos 0.8.15
- **Language**: Rust 2024 Edition
- **Auth Methods**: 8+ (Standard, JWT, LDAP, SMS, Email, WeChat, WeCom, OAuth2/OIDC)

## Scope

### ✅ In Scope
- Multiple authentication methods (7+ login types)
- Form validation (client-side and server validation)
- Error handling and user feedback
- Authentication API integration (`/auth/**` endpoints)
- Token management (JWT in localStorage/sessionStorage)
- AppContext integration (user state)
- Verification code workflows (SMS/Email countdown)
- QR code scanning flows (WeChat/WeCom)
- Callback handling (third-party OAuth)
- Responsive design across all devices

### ❌ Not in Scope
- Backend authentication implementation
- OAuth provider setup
- User registration/password reset
- Two-factor authentication (separate feature)
- SSO configuration
- LDAP server setup

## Supported Authentication Methods

### 1. Standard Username/Password (`/auth/login`)
- Basic credential-based authentication
- Default fallback method
- Standard username and password fields

### 2. JWT Login (`/auth/jwt-login`)
- Enhanced JWT-based authentication
- Returns JWT token for stateless auth
- Use for modern API integration

### 3. LDAP Enterprise Directory (`/auth/ldap-login`)
- Integration with corporate LDAP directory
- Username can be LDAP email or account
- Enterprise-grade authentication

### 4. SMS Verification Code (`/auth/sms-login` + `/auth/sms-send`)
- Send SMS to phone number
- Verify code with login
- 60-second countdown
- Resend capability

### 5. Email Verification Code (`/auth/email-login` + `/auth/email-send`)
- Send code to email address
- Verify code with login
- 60-second countdown
- Resend capability

### 6. WeChat Public Account (`/auth/wechat-qrcode` + `/auth/wechat-status` + `/auth/wechat-callback`)
- QR code generation
- Status polling
- Server callback verification
- WeChat OAuth integration

### 7. Enterprise WeChat (WeCom) (`/auth/wecom-init` + `/auth/wecom-login` + `/auth/wecom-qrcode`)
- OAuth2 state initialization
- QR code generation
- Login callback
- Enterprise account support

## Input

### Required Files
- `requirement.page.md` - Authentication requirements
    - Supported login methods
    - Enterprise configuration (LDAP, WeChat, WeCom)
    - Form fields per method
    - Security requirements

- `.r2mo/api/metadata.yaml` - API definitions under `/auth/**`
    - All authentication endpoints
    - Request/response schemas
    - Error codes and messages
    - Field requirements

- `.r2mo/api/marker.md` - Field attributes
    - Field type (text, password, phone, email)
    - Validation rules (length, format, required)
    - Display properties
    - Error messages

- `.r2mo/design/spec.md` - Design system
    - Login page background and styling
    - Form component styles
    - Button styles
    - Color scheme
    - Responsive design

- Project Configuration
    - `.r2mo/requirements/project.md` - Tech stack
    - WeChat/WeCom app credentials (if applicable)

## Output

### File: `src/pages/login.rs`

**Structure**:
```rust
// AuthMethod enum (7+ variants)
// Signal states per method (username, password, phone, email, qr_code, etc.)
// Validation functions per method
// API call functions per method
// Event handlers (send_code, check_status, etc.)
// View component with tab switching
```

**Key Components**:
1. **Method Tabs** - Switch between authentication approaches
2. **Standard Login** - Username/password form
3. **Code-based Login** - SMS/Email verification flow
4. **QR Code Login** - WeChat/WeCom QR code and polling
5. **Validation** - Real-time field validation per method
6. **Error Display** - Clear error messages for each failure type
7. **Countdown Timer** - 60-second for code-based methods
8. **Status Polling** - For QR code-based methods
9. **Token Storage** - Secure JWT storage
10. **Callback Handling** - OAuth callback processing

## Process

### 1. Analyze Authentication Requirements

```
Input: requirement.page.md
Extract:
  - Enabled authentication methods
  - Required form fields per method
  - Enterprise configuration (LDAP server, WeChat app ID, WeCom details)
  - Security requirements (TLS, token expiry, etc.)
  - Error handling expectations
```

### 2. Extract API Specifications from `/auth/**`

```
Input: .r2mo/api/metadata.yaml (filter /auth/ paths)
Extract for each method:
  - Endpoint path (/auth/login, /auth/sms-login, etc.)
  - HTTP method (POST, GET)
  - Request body schema
  - Response schema
  - Error responses
  - Field requirements and constraints
```

### 3. Define Authentication Method Enum

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AuthMethod {
    Standard,      // /auth/login
    JWT,           // /auth/jwt-login
    LDAP,          // /auth/ldap-login
    SMS,           // /auth/sms-login
    Email,         // /auth/email-login
    WeChat,        // /auth/wechat-qrcode
    WeCom,         // /auth/wecom-init
}
```

### 4. Implement Form States per Method

```
For each method:
  - Create signal(s) for all required fields
  - Implement validation function
  - Handle method-specific logic (countdown, polling, etc.)
  - Display appropriate error messages
```

### 5. Implement Verification Code Workflow

```
For SMS/Email methods:
  1. Implement send_code function (call /auth/sms-send or /auth/email-send)
  2. Start countdown timer (60 seconds)
  3. Disable resend button during countdown
  4. Allow resend after countdown completes
  5. Validate code before submitting login
```

### 6. Implement QR Code Workflow

```
For WeChat/WeCom methods:
  1. Call /auth/wechat-qrcode or /auth/wecom-qrcode
  2. Display QR code
  3. Start polling /auth/wechat-status or equivalent
  4. Poll every 2-3 seconds until user scans
  5. Handle callback (/auth/wechat-callback)
  6. Auto-login on successful scan
```

### 7. Implement Token Management

```
After successful login:
  1. Extract JWT token from response
  2. Store in localStorage or sessionStorage
  3. Set Authorization: Bearer {token} for API calls
  4. Store user info in AppContext
  5. Handle token expiry and refresh
```

### 8. Implement Error Handling

```
Handle errors:
  - Invalid credentials (auth failed)
  - Network errors (timeout, connection refused)
  - API errors (LDAP unavailable, SMS quota, etc.)
  - Validation errors (field format wrong)
  - Session errors (token expired, logout required)
  - Display user-friendly Chinese error messages
```

### 9. Design Responsive Layout

```
Ensure responsiveness:
  - Mobile: Full-width, stacked form
  - Tablet: Centered form, readable
  - Desktop: Centered form with background
  - Tabs for method switching
  - QR code display (WeChat/WeCom)
```

## Rules

### Mandatory Rules

1. **API-First Design**
    - All endpoints from `.r2mo/api/metadata.yaml` `/auth/**` paths
    - Field names and types exactly as in API spec
    - Request/response schema matches API definition
    - NO hardcoded endpoint paths

2. **Frontend Validation Only**
    - Client-side validation on all fields
    - Server-side validation assumed
    - NO security logic on client
    - Validation messages from marker.md

3. **Token Management**
    - Store JWT in localStorage or sessionStorage
    - Include in Authorization: Bearer header
    - Clear token on logout
    - Handle token expiration gracefully

4. **AppContext Integration**
    - Update AppContext on successful login
    - Set is_logged_in: true
    - Store user information
    - Update permissions if available

5. **Code-Based Methods (SMS/Email)**
    - Call send endpoint first
    - Implement 60-second countdown
    - Prevent spam (disable resend during countdown)
    - Support resend after countdown expires
    - Validate code before login

6. **QR Code Methods (WeChat/WeCom)**
    - Fetch QR code (display immediately)
    - Implement polling (2-3 second interval)
    - Timeout after 5 minutes
    - Handle callback verification
    - Auto-login on success

7. **Error Handling**
    - Catch all API errors
    - Transform API errors to user-friendly messages
    - Log errors for debugging
    - Implement retry logic where appropriate
    - Distinguish between auth failures and system errors

8. **Redirect After Login**
    - Navigate to home page on success
    - Preserve returnUrl parameter if provided
    - Use use_navigate() from leptos_router

9. **Design System Compliance**
    - Use colors from spec.md
    - Apply responsive design
    - Follow component styles
    - Use Tailwind CSS exclusively

## Implementation Patterns

### Method Selection Handler

```rust
let handle_method_change = |method: AuthMethod| {
    set_active_method.set(method);
    set_error_message.set(String::new()); // Clear errors
    clear_all_fields(); // Reset form
};
```

### Code Send Handler

```rust
let handle_send_code = {
    let set_countdown = set_countdown.clone();
    move |phone_or_email: String| {
        // Call /auth/sms-send or /auth/email-send
        spawn_local(async move {
            match send_code_api(&phone_or_email).await {
                Ok(_) => {
                    set_countdown.set(60); // Start 60-second countdown
                    start_countdown_timer();
                },
                Err(e) => set_error_message.set(e.to_string()),
            }
        });
    }
};
```

### QR Code Status Polling

```rust
let poll_qr_status = {
    let set_login_status = set_login_status.clone();
    move || {
        spawn_local(async move {
            loop {
                match check_wechat_status_api().await {
                    Ok(WeChatStatus::Scanned) => {
                        set_login_status.set("已扫描，请确认");
                        delay(500ms).await;
                    },
                    Ok(WeChatStatus::Confirmed) => {
                        set_login_success.set(true);
                        break;
                    },
                    _ => {
                        delay(3000ms).await;
                    }
                }
            }
        });
    }
};
```

## Validation Checklist

- [ ] All enabled methods from requirement.page.md implemented
- [ ] All `/auth/**` endpoints properly called
- [ ] All request/response schemas match API spec
- [ ] All form fields from marker.md defined
- [ ] Validation rules applied correctly
- [ ] Error messages displayed clearly and in Chinese
- [ ] SMS/Email countdown working (60 seconds)
- [ ] QR code polling working (2-3 sec interval)
- [ ] Token stored securely
- [ ] AppContext updated on login
- [ ] Navigation works after login
- [ ] Error handling for all failure scenarios
- [ ] Responsive design tested on all devices
- [ ] Design system applied (colors, fonts, spacing)
- [ ] No hardcoded values (all from API/spec/marker.md)
- [ ] Leptos patterns followed
- [ ] No compilation warnings

## Success Criteria

- ✅ Login module compiles without errors
- ✅ All enabled authentication methods functional
- ✅ Form validation working correctly
- ✅ All API integrations complete and tested
- ✅ Token storage and management working
- ✅ AppContext properly updated
- ✅ Redirect after login successful
- ✅ Error messages clear and helpful
- ✅ SMS/Email code workflows working
- ✅ QR code scanning working
- ✅ Responsive design on all devices
- ✅ Design system applied consistently
- ✅ Security best practices followed
- ✅ User experience smooth and intuitive
- ✅ Ready for production use

## Related Skills
- **r2-dev-layout** - Main application layout with authenticated user
- **r2-dev-page** - Regular page development
- **r2-sys-integrate** - System integration with login page routing

## Version

- **Version**: 1.2.1 (Added selective method implementation guidance)
- **Last Updated**: 2026-02-07
- **Status**: Production Ready
- **Framework**: Leptos 0.8.15
- **Language**: Rust 2024 Edition
- **Auth Methods**: 8+ (Standard, JWT, LDAP, SMS, Email, WeChat, WeCom, OAuth2/OIDC) - Choose based on requirements








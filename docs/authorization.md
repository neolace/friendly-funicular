# Authorization

Authorization happens in two separate Lambda steps. Neither step trusts the browser.

1. **Admission (token validation).** Is this an authentic Entra v2 access
   token from our tenant, for our API, still valid, and carrying
   `access_as_user`? The code is in `apps/api/src/auth/token-validator.ts`.
2. **Business authorization.** Can this validated identity perform this
   operation on this resource? The code is in `apps/api/src/auth/authorization.ts`.

```mermaid
%%{init: {
  "theme": "base",
  "securityLevel": "strict",
  "themeVariables": {
    "background": "#0d1117",
    "primaryColor": "#161b22",
    "primaryTextColor": "#f0f6fc",
    "primaryBorderColor": "#58a6ff",
    "secondaryColor": "#21262d",
    "secondaryTextColor": "#f0f6fc",
    "secondaryBorderColor": "#3fb950",
    "tertiaryColor": "#1c2128",
    "tertiaryTextColor": "#f0f6fc",
    "tertiaryBorderColor": "#d29922",
    "lineColor": "#58a6ff",
    "textColor": "#f0f6fc",
    "clusterBkg": "#161b22",
    "clusterBorder": "#30363d",
    "edgeLabelBackground": "#0d1117",
    "actorBkg": "#161b22",
    "actorBorder": "#58a6ff",
    "actorTextColor": "#f0f6fc",
    "signalColor": "#58a6ff",
    "signalTextColor": "#f0f6fc"
  }
}}%%

flowchart TD
    Req["Request + Bearer token"]
    V["Token validation<br/>signature · iss · aud · tid · exp/nbf · ver · oid"]
    S{"scp contains<br/>access_as_user?"}
    ID["Immutable RequestIdentity<br/>oid · sub · tid · scopes · roles"]
    B{"Business rule<br/>owner? role? same tenant?"}
    OK["Handler executes"]
    R401["401 invalid_token"]
    R403s["403 insufficient_scope"]
    R403["403 forbidden"]

    Req --> V
    V -->|invalid| R401
    V --> S
    S -->|no| R403s
    S -->|yes| ID --> B
    B -->|deny| R403
    B -->|allow| OK
```

## Rules

- Only **stable claims** are used: `oid`, `sub`, `tid`, `scp`, `roles`.
- `email`, `preferred_username`, UPN and display name are **never** used for
  authorization. `name` is carried for presentation only.
- Handlers receive the normalized `RequestIdentity`, never the raw token.
- The frontend `ProtectedRoute` only affects the user experience.

## Helpers

| Helper                                        | Semantics                                                            |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `hasScope` / `requireScope`                   | Delegated scope check (`403 insufficient_scope`)                     |
| `hasRole` / `requireRole` / `requireAnyRole`  | Entra app-role check (`roles` claim)                                 |
| `canAccessResource` / `requireResourceAccess` | Owner (`oid`) or optional admin role; **cross-tenant always denied** |

## Adding app roles

When different privilege levels are needed, define **app roles** on the
registration (for example `Admin`, `Reader`) and assign them to users or
groups. Then call `requireRole` in the handler. Do not hard-code users or
emails. Every new rule needs positive and negative tests in
`apps/api/test/authorization.test.ts`.

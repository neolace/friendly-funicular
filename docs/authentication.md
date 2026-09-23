# Authentication

The SPA is a **public client**. MSAL (`@azure/msal-browser` +
`@azure/msal-react`) runs OAuth 2.0 Authorization Code Flow with PKCE against
the tenant-specific authority `https://login.microsoftonline.com/<TENANT_ID>`.
Credentials, MFA and Conditional Access are all handled on Microsoft-hosted
pages. The application never renders credential fields.

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

sequenceDiagram
    autonumber
    actor User
    participant SPA as React / Vite SPA
    participant MSAL as MSAL.js
    participant Entra as Microsoft Entra ID
    participant URL as Lambda Function URL
    participant Lambda as AWS Lambda

    User->>SPA: Open application
    SPA->>MSAL: initialize() + handleRedirectPromise()
    alt No cached account
        SPA->>User: /login page
        User->>SPA: "Sign in with Microsoft"
        SPA->>MSAL: loginRedirect(scopes=[api://CLIENT_ID/access_as_user], state=returnTo)
        MSAL->>Entra: /authorize + code_challenge (S256)
        Entra->>User: Credentials / MFA / Conditional Access
        Entra-->>SPA: Authorization code
        MSAL->>Entra: Redeem code + PKCE verifier
        Entra-->>MSAL: ID token + access token
    end
    SPA->>MSAL: acquireTokenSilent()
    MSAL-->>SPA: Access token (sessionStorage cache)
    SPA->>URL: GET /api/me, Authorization: Bearer
    URL->>Lambda: Invoke
    Lambda->>Entra: OIDC discovery + JWKS (cached per execution environment)
    Lambda->>Lambda: Validate signature, iss, aud, tid, exp/nbf, ver, scp
    alt Valid
        Lambda-->>SPA: 200 MeResponse
    else Invalid / missing scope
        Lambda-->>SPA: 401 / 403
    end
```

## Frontend modules

| Module                         | Responsibility                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/config/environment.ts`    | Reads and validates `VITE_*`. Rejects `common`, non-HTTPS APIs and scope mismatches            |
| `src/auth/auth-config.ts`      | MSAL configuration, login request and `sanitizeReturnTo` (open-redirect guard)                 |
| `src/auth/auth-provider.tsx`   | One-time MSAL bootstrap and the explicit auth state machine                                    |
| `src/auth/use-auth.ts`         | `AuthContext` and the `useAuth()` hook                                                         |
| `src/auth/token-service.ts`    | `acquireTokenSilent`, falling back to `acquireTokenRedirect` only when interaction is required |
| `src/auth/protected-route.tsx` | UX gate for session-only routes. Not a security boundary                                       |
| `src/api/api-client.ts`        | Adds the bearer token, correlation IDs, error mapping and retries                              |

## Session states

The UI never flashes protected content. Routing decisions wait for
initialization to finish.

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

stateDiagram-v2
    [*] --> initializing
    initializing --> authenticated: cached account / redirect result
    initializing --> unauthenticated: no account
    initializing --> error: MSAL / redirect failure
    unauthenticated --> redirecting: login()
    authenticated --> redirecting: logout()
    authenticated --> interaction_required: silent token needs interaction
    interaction_required --> redirecting: acquireTokenRedirect()
    error --> initializing: retry()
```

## Key decisions

- **`loginRedirect` / `acquireTokenRedirect`**, not popups. Redirects are more
  reliable under Conditional Access and popup blockers.
- **`sessionStorage` token cache.** Tokens last only for the browser tab
  session. Changing this is a security trade-off, so record it in
  [security.md](security.md) first.
- **Access tokens only go to the API.** The ID token is never sent as a credential.
- **Refreshing the page** restores the session through the MSAL cache and
  silent acquisition, without a visible login.
- **Return path.** The requested path is carried in the OAuth `state`. It is
  sanitized to a same-origin relative path before it is honoured.
- Tokens are never logged. MSAL PII logging is disabled.

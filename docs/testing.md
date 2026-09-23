# Testing

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

flowchart TB
    Unit["Unit — Vitest<br/>API policy · web modules"] --> Comp["Component — RTL<br/>auth states · pages"]
    Comp --> Infra["Infrastructure — CDK assertions"]
    Infra --> E2E["E2E — Playwright<br/>stubbed Entra (CI) · deployed (gated)"]
    E2E --> Smoke["Post-deploy smoke tests"]
```

| Layer          | Location                     | Command                                 |
| -------------- | ---------------------------- | --------------------------------------- |
| API unit       | `apps/api/test`              | `npm test -w @friendly-funicular/api`   |
| Web unit/RTL   | `apps/web/src/**/*.test.tsx` | `npm test -w @friendly-funicular/web`   |
| CDK assertions | `infra/test`                 | `npm test -w @friendly-funicular/infra` |
| E2E            | `apps/web/e2e`               | `npm run test:e2e`                      |
| Everything     |                              | `npm run validate`                      |

## API security tests

The tests sign real RS256 JWTs with a throwaway key (`test/helpers.ts`) and
verify them through the production validator with a local JWKS. They cover
valid tokens, missing/malformed/expired/not-yet-valid tokens, wrong
issuer/audience/tenant, v1 tokens, missing `oid`, missing scope (403),
app-only tokens, unknown key, wrong key, HS256 downgrade, tampered payload,
OIDC discovery issuer mismatch and a rogue `jwks_uri`. Handler tests cover
401/403/404/405/500, correlation IDs, and that tokens never appear in logs.
Cryptographic primitives are not re-tested because they belong to `jose`.

## Frontend tests

MSAL is replaced by a fake `IPublicClientApplication` or a fake `AuthContext`.
The tests cover: login page rendering with no credential fields, keyboard
operation, loading/redirect/error/retry states, redirect completion,
return-path sanitizing, session restore, silent token acquisition,
interaction-required fallback, API `Authorization` header, 401/403/429/5xx,
network and timeout mapping, retry policy, and logout.

## E2E

- **Local/CI** (`e2e/login.spec.ts`): runs the real SPA in Chromium with
  `login.microsoftonline.com` stubbed. It asserts that the authorize redirect
  uses `response_type=code`, `code_challenge_method=S256`, the API scope, and
  no client secret.
- **Deployed** (`e2e/deployed.spec.ts`): set `E2E_BASE_URL`,
  `E2E_STORAGE_STATE` (a captured session for a controlled test identity) and
  `E2E_API_BASE_URL`. MFA and Conditional Access are never weakened for
  automation. Capture the storage state manually with `npx playwright codegen
--save-storage=state.json <url>`.

If Playwright's bundled browser is unavailable, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a local Chromium.

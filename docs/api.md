# API

- **Base URL:** the Lambda Function URL (`https://<id>.lambda-url.<region>.on.aws`).
- **Authentication:** `Authorization: Bearer <Entra v2 access token>` with the
  `access_as_user` scope.

## Request lifecycle

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
    Request["HTTPS request"] --> URL["Lambda Function URL<br/>CORS preflight handled here"]
    URL --> Lambda["Lambda handler"]
    Lambda --> Corr["Correlation ID<br/>(x-correlation-id or new UUID)"]
    Corr --> Public{"Public route?"}
    Public -->|"GET /api/health"| Health["200 status ok"]
    Public -->|no| Validate["Token validation"]
    Validate -->|fail| Deny["401 / 403"]
    Validate --> Route{"Route exists?"}
    Route -->|no| NF["404 / 405"]
    Route -->|yes| Handler["Handler + business authorization"]
    Handler --> Resp["JSON response + x-correlation-id"]
    Deny --> Log["Structured request log"]
    NF --> Log
    Resp --> Log
    Health --> Log
```

Unknown paths are authenticated **before** a 404 is returned, so anonymous
callers cannot enumerate routes.

## Endpoints

### `GET /api/health` (public)

```json
{ "status": "ok" }
```

This endpoint never exposes configuration, versions or dependency status.

### `GET /api/me` (protected)

This is a diagnostic bootstrap endpoint. It returns an allow-listed projection
of the validated identity and never the raw token.

```json
{
  "oid": "…",
  "tenantId": "…",
  "scopes": ["access_as_user"],
  "roles": [],
  "name": "Ada Lovelace"
}
```

## Errors

Every error has the same shape:

```json
{ "error": { "code": "unauthorized", "message": "…", "correlationId": "…" } }
```

| Status | `code`               | Meaning                                                                   | Header                                           |
| ------ | -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| 401    | `unauthorized`       | Missing, malformed, expired, wrong issuer/audience/tenant/signature       | `WWW-Authenticate: Bearer error="invalid_token"` |
| 403    | `forbidden`          | Missing `access_as_user` scope or business rule denied                    | `insufficient_scope` for scope failures          |
| 404    | `not_found`          | Unknown route (only after authentication)                                 |                                                  |
| 405    | `method_not_allowed` | Known route, wrong method                                                 | `Allow`                                          |
| 500    | `internal_error`     | Unexpected failure. Details are only in the logs, found by correlation ID |                                                  |

Every response carries `x-correlation-id` and `cache-control: no-store`.

## CORS

CORS is set on the Function URL, not in code. Allowed origins come from the
environment config and are never `*`. The allowed methods are `GET` and
`POST`. The allowed headers are `authorization`, `content-type` and
`x-correlation-id`. Credentials are disabled because tokens travel in headers,
not cookies.

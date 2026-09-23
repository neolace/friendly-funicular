# friendly-funicular

A secure single-page application that signs users in with **Microsoft Entra
ID** and calls an **AWS Lambda Function URL** that validates the Entra access
token itself. There is no Cognito, no Amplify and no client secret in the
browser.

- **Frontend:** React 19 + Vite + TypeScript, MSAL (Authorization Code + PKCE),
  served from private S3 through CloudFront (OAC).
- **Backend:** TypeScript Lambda behind a Function URL. It validates tokens
  against the tenant's OIDC metadata and JWKS (`jose`), then applies business
  authorization.
- **Infrastructure:** AWS CDK v2 (Backend, Frontend and Observability stacks)
  with CloudWatch alarms and a dashboard.
- **Quality:** ESLint, Prettier, TypeScript, Vitest, React Testing Library,
  CDK assertions, Playwright, Husky + lint-staged, GitHub Actions with OIDC.

Start with [docs/architecture.md](docs/architecture.md). The original design
plan is in [plan.md](plan.md).

## Layout

```text
apps/web          React/Vite SPA (auth layer, routing, API client, pages)
apps/api          Lambda handler (token validation, authorization, logging)
packages/shared   Types shared by SPA and API
infra             CDK app and assertion tests
docs              Architecture, security, operations docs + ADRs
.github           CI and deploy workflows
```

## Quick start

Requires Node.js 22+.

1. Configure the Entra app registration: [docs/entra-configuration.md](docs/entra-configuration.md).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Deploy a dev backend ([docs/deployment.md](docs/deployment.md)), then configure the SPA:

   ```bash
   cp apps/web/.env.example apps/web/.env.local   # tenant ID, client ID, API scope, Function URL
   npm run dev                                    # http://localhost:5173
   ```

## Scripts

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm run dev`           | Vite dev server for the SPA                                              |
| `npm run build`         | Bundle the Lambda (`apps/api/dist`) and build the SPA (`apps/web/dist`)  |
| `npm test`              | Unit, component and CDK assertion tests                                  |
| `npm run test:coverage` | Same, with coverage                                                      |
| `npm run test:e2e`      | Playwright (login flow with stubbed Entra; deployed suite if configured) |
| `npm run lint`          | ESLint (`lint:fix` to autofix)                                           |
| `npm run format`        | Prettier write (`format:check` in CI)                                    |
| `npm run typecheck`     | `tsc` across all workspaces                                              |
| `npm run synth`         | `cdk synth` (needs `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, API bundle)     |
| `npm run validate`      | format check → lint → typecheck → test → build (same gates as CI)        |

The SPA production build fails on purpose if a required `VITE_*` value is
missing, or if any `VITE_*` name looks like a secret.

## Security model in one line

Entra authenticates the user. Lambda checks that the token is authentic, from
our tenant, for our API, unexpired and scoped. Lambda then decides, using
stable claims only, whether that identity may perform the operation. See
[docs/security.md](docs/security.md).

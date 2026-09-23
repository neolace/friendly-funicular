# CI/CD

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

flowchart LR
    Commit["Commit / Pull Request"]
    Format["Prettier Check"]
    Lint["ESLint"]
    Types["TypeScript Check"]
    Unit["Unit + CDK assertion tests"]
    Build["Production Build"]
    Synth["CDK Synth"]
    E2E["Playwright"]
    Security["npm audit + bundle secret scan"]
    Review["Pull Request Review"]
    OIDC["GitHub OIDC<br/>AWS Role"]
    DeployB["CDK Deploy Backend"]
    WebBuild["Build SPA with Function URL"]
    DeployF["CDK Deploy Frontend + Observability"]
    S3["S3 sync"]
    Invalidate["CloudFront Invalidation"]
    Smoke["Smoke Tests"]

    Commit --> Format & Lint & Types & Unit
    Format & Lint & Types & Unit --> Build & E2E & Security
    Build --> Synth
    Synth & E2E & Security --> Review
    Review --> OIDC --> DeployB --> WebBuild --> DeployF --> S3 --> Invalidate --> Smoke
```

## CI — `.github/workflows/ci.yml`

This runs on every pull request and every push to `master`/`main`. It never
modifies source files. Jobs: **quality** (format check, lint, typecheck,
tests with coverage) → **build** (API + SPA bundles, `cdk synth`), **e2e**
(Playwright login flow with stubbed Entra) and **security** (`npm audit`,
secret scan of the SPA bundle). It uses public placeholder Entra GUIDs.

## CD — `.github/workflows/deploy.yml`

This runs on push to `master`/`main` (targeting `dev`) or by manual dispatch
(`dev`, `test`, `prod`). It authenticates to AWS with **GitHub OIDC**; there
are no stored AWS keys.

### One-time setup

1. Create the GitHub OIDC identity provider in the AWS account
   (`token.actions.githubusercontent.com`).
2. Create a deploy role whose trust policy is limited to this repository and
   environment:
   `"token.actions.githubusercontent.com:sub": "repo:<owner>/friendly-funicular:environment:<env>"`.
   Scope its permissions to CDK bootstrap roles
   (`sts:AssumeRole` on `cdk-*-deploy-role`, `cdk-*-file-publishing-role`,
   `cdk-*-lookup-role`), plus `s3:*Object`/`s3:ListBucket` on the site bucket
   and `cloudfront:CreateInvalidation` on the distribution.
3. Run `cdk bootstrap aws://<account>/<region>` once per account and region.
4. In **GitHub → Settings → Environments** create `dev`, `test` and `prod`.
   Add required reviewers to `test` and `prod`, and set these **variables**
   (they are not secrets):
   `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`,
   `ALLOWED_ORIGINS`, and optionally `DOMAIN_NAME`, `CERTIFICATE_ARN`,
   `HOSTED_ZONE_NAME`, `ALARM_EMAIL`.
5. Protect `master`: require PRs, required reviews and the CI checks.

### Deployment order

The backend is deployed first. Its Function URL output then feeds the SPA
build (`VITE_API_BASE_URL`) and the CloudFront CSP. The frontend and
observability stacks follow. Hashed assets are uploaded with a one-year
immutable cache, and `index.html` with `no-cache`, followed by an invalidation.

### Smoke tests

After deployment the pipeline checks that the SPA root and a deep link return
200, that HTTP redirects to HTTPS, that the CSP and HSTS headers are present,
that `/api/health` is healthy, and that `/api/me` without a token or with a
forged one returns 401.

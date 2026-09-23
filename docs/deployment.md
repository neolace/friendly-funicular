# Deployment

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
    A["Entra registration configured<br/>(entra-configuration.md)"] --> B["cdk bootstrap (once)"]
    B --> C["Deploy Backend<br/>→ Function URL"]
    C --> D["Build SPA with VITE_API_BASE_URL = Function URL"]
    D --> E["Deploy Frontend + Observability"]
    E --> F["Upload dist/ to S3 · invalidate CloudFront"]
    F --> G["Add CloudFront/custom domain to<br/>Entra redirect URIs + ALLOWED_ORIGINS"]
    G --> H["Smoke tests · check dashboard"]
```

## Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in tenant/client IDs + API URL
npm run build -w @friendly-funicular/api
npm run dev                                    # http://localhost:5173
```

The SPA needs a reachable API. Deploy the `dev` backend (which allows
`http://localhost:5173` via CORS) and set `VITE_API_BASE_URL` to its Function
URL.

## Manual deploy

The pipeline is the normal path. For a manual deploy:

```bash
export DEPLOY_ENV=dev ENTRA_TENANT_ID=<tenant> ENTRA_CLIENT_ID=<client>
npm ci && npm run build -w @friendly-funicular/api
cd infra
npx cdk deploy FriendlyFunicular-dev-Backend --outputs-file ../cdk-backend.json
cd ..
VITE_ENTRA_TENANT_ID=$ENTRA_TENANT_ID VITE_ENTRA_CLIENT_ID=$ENTRA_CLIENT_ID \
VITE_ENTRA_API_SCOPE=api://$ENTRA_CLIENT_ID/access_as_user \
VITE_API_BASE_URL=<FunctionUrl without trailing slash> \
npm run build -w @friendly-funicular/web
cd infra && npx cdk deploy FriendlyFunicular-dev-Frontend FriendlyFunicular-dev-Observability
aws s3 sync ../apps/web/dist s3://<BucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

## First deployment of an environment

There is a chicken-and-egg problem with origins. The CloudFront domain is only
known after the first frontend deploy.

1. Deploy with `ALLOWED_ORIGINS` set to your custom domain or a temporary origin.
2. Take `DistributionDomainName` from the outputs and add
   `https://<domain>` to **both** the Entra SPA redirect URIs and
   `ALLOWED_ORIGINS`.
3. Redeploy the backend.

## Rollback

- **Frontend.** Re-run the deploy workflow on the previous commit. Bucket
  versioning also allows restoring the previous `index.html`.
- **Backend.** Re-run the deploy workflow on the previous commit. The CDK
  deploy is atomic per stack.

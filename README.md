# friendly-funicular

Node/Express app with "Sign in with Microsoft Entra ID" via OIDC (`express-openid-connect`).

## Setup

1. In Entra ID, register an app (Web platform) with redirect URI `http://localhost:3000/callback` (update for your AWS-hosted URL later, e.g. `https://your-app.example.com/callback`).
2. Create a client secret for it.
3. `cp .env.example .env` and fill in `AUTH_TENANT_ID`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and a random `SESSION_SECRET` (e.g. `openssl rand -hex 32`).
4. `npm install`
5. `npm start`, then visit `http://localhost:3000` and click Sign in.

When deploying to AWS, set `BASE_URL` to the app's public URL and add `<BASE_URL>/callback` as a redirect URI on the Entra app registration.

## Scripts

- `npm run build` — syntax-check the source files
- `npm run lint` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm test` — unit tests (`test/`), run offline against the app object
- `npm run test:e2e` — end-to-end (`e2e/`), spawns the real server and hits it over HTTP

Tests default `AUTH_TENANT_ID` to Microsoft's public `common` tenant so OIDC discovery succeeds without real Entra credentials.

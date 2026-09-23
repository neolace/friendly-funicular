import { defineConfig, devices } from '@playwright/test';

/**
 * Two kinds of E2E runs:
 *  - Local/CI (default): starts Vite with placeholder Entra identifiers and
 *    stubs login.microsoftonline.com, proving the SPA's login redirect
 *    (Authorization Code + PKCE) without touching a real tenant.
 *  - Deployed (E2E_BASE_URL set): runs against a real environment using a
 *    pre-authenticated storage state for a controlled test identity
 *    (E2E_STORAGE_STATE). MFA/Conditional Access are never weakened for tests.
 */
const deployedBaseUrl = process.env.E2E_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export const E2E_TENANT_ID = '11111111-2222-3333-4444-555555555555';
export const E2E_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: deployedBaseUrl ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployedBaseUrl
    ? undefined
    : {
        command: 'npx vite --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        env: {
          VITE_ENTRA_TENANT_ID: E2E_TENANT_ID,
          VITE_ENTRA_CLIENT_ID: E2E_CLIENT_ID,
          VITE_ENTRA_API_SCOPE: `api://${E2E_CLIENT_ID}/access_as_user`,
          VITE_API_BASE_URL: 'http://localhost:5999',
        },
      },
});

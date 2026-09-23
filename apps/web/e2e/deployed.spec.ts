import { expect, test } from '@playwright/test';

/**
 * Full path against a deployed environment:
 * Browser → Entra (pre-established session) → SPA → access token →
 * Lambda Function URL → Lambda JWT validation → 200.
 *
 * Requires E2E_BASE_URL and E2E_STORAGE_STATE (a Playwright storage state
 * captured for a controlled test identity). Skipped otherwise.
 */
const baseUrl = process.env.E2E_BASE_URL;
const storageState = process.env.E2E_STORAGE_STATE;

test.skip(!baseUrl || !storageState, 'deployed environment not configured');
test.use({ storageState: storageState ?? undefined });

test('signed-in user sees identity validated by the Lambda API', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByText('Object ID (oid)')).toBeVisible();
  await expect(page.getByText('access_as_user')).toBeVisible();
});

test('the API rejects requests without a bearer token', async ({ request }) => {
  const apiBase = process.env.E2E_API_BASE_URL;
  test.skip(!apiBase, 'E2E_API_BASE_URL not set');
  const response = await request.get(`${apiBase}/api/me`);
  expect(response.status()).toBe(401);
});

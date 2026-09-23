import { expect, test, type Page } from '@playwright/test';
import { E2E_CLIENT_ID, E2E_TENANT_ID } from '../playwright.config';

test.skip(!!process.env.E2E_BASE_URL, 'local-only suite');

const AUTHORITY = `https://login.microsoftonline.com/${E2E_TENANT_ID}`;

/** Stub Entra's discovery endpoints and capture the authorize redirect. */
async function stubEntra(page: Page): Promise<() => URL | undefined> {
  let authorizeUrl: URL | undefined;
  await page.route('https://login.microsoftonline.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/discovery/instance')) {
      return route.fulfill({
        json: {
          tenant_discovery_endpoint: `${AUTHORITY}/v2.0/.well-known/openid-configuration`,
          'api-version': '1.1',
          metadata: [
            {
              preferred_network: 'login.microsoftonline.com',
              preferred_cache: 'login.windows.net',
              aliases: ['login.microsoftonline.com', 'login.windows.net'],
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return route.fulfill({
        json: {
          issuer: `${AUTHORITY}/v2.0`,
          authorization_endpoint: `${AUTHORITY}/oauth2/v2.0/authorize`,
          token_endpoint: `${AUTHORITY}/oauth2/v2.0/token`,
          end_session_endpoint: `${AUTHORITY}/oauth2/v2.0/logout`,
          jwks_uri: `${AUTHORITY}/discovery/v2.0/keys`,
          response_modes_supported: ['query', 'fragment', 'form_post'],
        },
      });
    }
    if (url.pathname.endsWith('/oauth2/v2.0/authorize')) {
      authorizeUrl = url;
      return route.fulfill({
        contentType: 'text/html',
        body: '<h1>Stubbed Microsoft sign-in</h1>',
      });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  return () => authorizeUrl;
}

test('unauthenticated users are sent to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Secure Application' }),
  ).toBeVisible();
  await expect(page.getByText('Protected by Microsoft Entra ID')).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
});

test('sign-in uses Authorization Code + PKCE against the tenant authority', async ({
  page,
}) => {
  const authorizeUrl = await stubEntra(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Stubbed Microsoft sign-in' }),
  ).toBeVisible();

  const url = authorizeUrl();
  expect(url).toBeDefined();
  expect(url!.origin + url!.pathname).toBe(
    `${AUTHORITY}/oauth2/v2.0/authorize`,
  );
  const params = url!.searchParams;
  expect(params.get('client_id')).toBe(E2E_CLIENT_ID);
  expect(params.get('response_type')).toBe('code');
  expect(params.get('code_challenge_method')).toBe('S256');
  expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  expect(params.get('scope')).toContain(
    `api://${E2E_CLIENT_ID}/access_as_user`,
  );
  expect(params.get('redirect_uri')).toBe('http://localhost:5173');
  expect(params.has('client_secret')).toBe(false);
});

test('the login page is keyboard operable', async ({ page }) => {
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Sign in with Microsoft' }),
  ).toBeFocused();
});

test('unknown routes show a not-found page', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

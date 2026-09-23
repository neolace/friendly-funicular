import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/config.js';
import { CLIENT_ID, TENANT_ID } from './helpers.js';

describe('loadConfig', () => {
  it('loads and normalizes valid configuration', () => {
    const config = loadConfig({
      ENTRA_TENANT_ID: TENANT_ID.toUpperCase(),
      ENTRA_CLIENT_ID: CLIENT_ID,
      DEPLOY_ENV: 'prod',
    });
    expect(config).toMatchObject({
      tenantId: TENANT_ID,
      audience: CLIENT_ID,
      requiredScope: 'access_as_user',
      environment: 'prod',
      clockToleranceSeconds: 60,
    });
  });

  it('fails clearly when identifiers are missing or malformed', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ENTRA_TENANT_ID: 'common', ENTRA_CLIENT_ID: CLIENT_ID }),
    ).toThrow(/ENTRA_TENANT_ID/);
  });
});

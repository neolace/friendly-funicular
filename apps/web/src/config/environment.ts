import { API_SCOPE_NAME } from '@friendly-funicular/shared';

/** Public, non-secret runtime configuration for the SPA. */
export interface AppEnvironment {
  tenantId: string;
  clientId: string;
  apiScope: string;
  apiBaseUrl: string;
}

export class EnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid application configuration: ${problems.join('; ')}`);
    this.name = 'EnvironmentError';
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnvSource = Partial<Record<keyof ImportMetaEnv, string | undefined>>;

export function readEnvironment(
  source: EnvSource = import.meta.env,
): AppEnvironment {
  const tenantId = source.VITE_ENTRA_TENANT_ID?.trim() ?? '';
  const clientId = source.VITE_ENTRA_CLIENT_ID?.trim() ?? '';
  const apiScope = source.VITE_ENTRA_API_SCOPE?.trim() ?? '';
  const apiBaseUrl = (source.VITE_API_BASE_URL?.trim() ?? '').replace(
    /\/+$/,
    '',
  );

  const problems: string[] = [];
  if (!GUID.test(tenantId)) {
    problems.push('VITE_ENTRA_TENANT_ID must be a tenant GUID (not "common")');
  }
  if (!GUID.test(clientId))
    problems.push('VITE_ENTRA_CLIENT_ID must be a GUID');
  if (apiScope !== `api://${clientId}/${API_SCOPE_NAME}`) {
    problems.push(
      `VITE_ENTRA_API_SCOPE must be api://<VITE_ENTRA_CLIENT_ID>/${API_SCOPE_NAME}`,
    );
  }
  if (!isAllowedApiUrl(apiBaseUrl)) {
    problems.push(
      'VITE_API_BASE_URL must be an https:// URL (http only for localhost)',
    );
  }
  if (problems.length > 0) throw new EnvironmentError(problems);

  return Object.freeze({ tenantId, clientId, apiScope, apiBaseUrl });
}

function isAllowedApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

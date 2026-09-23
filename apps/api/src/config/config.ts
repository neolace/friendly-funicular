import { API_SCOPE_NAME } from '@friendly-funicular/shared';

/**
 * Non-secret operational configuration supplied by CDK as environment
 * variables. Loaded once per execution environment.
 */
export interface ApiConfig {
  serviceName: string;
  environment: string;
  tenantId: string;
  /** v2 access tokens carry the API app's client ID as `aud`. */
  audience: string;
  requiredScope: string;
  /** Allowed clock skew when checking exp/nbf, in seconds. */
  clockToleranceSeconds: number;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): ApiConfig {
  const tenantId = env.ENTRA_TENANT_ID?.trim() ?? '';
  const audience = env.ENTRA_CLIENT_ID?.trim() ?? '';

  const problems: string[] = [];
  if (!GUID.test(tenantId)) problems.push('ENTRA_TENANT_ID must be a GUID');
  if (!GUID.test(audience)) problems.push('ENTRA_CLIENT_ID must be a GUID');
  if (problems.length > 0) {
    throw new ConfigError(`Invalid API configuration: ${problems.join('; ')}`);
  }

  const tolerance = Number(env.CLOCK_TOLERANCE_SECONDS ?? '60');

  return Object.freeze({
    serviceName: env.SERVICE_NAME ?? 'friendly-funicular-api',
    environment: env.DEPLOY_ENV ?? 'dev',
    tenantId: tenantId.toLowerCase(),
    audience: audience.toLowerCase(),
    requiredScope: env.REQUIRED_SCOPE ?? API_SCOPE_NAME,
    clockToleranceSeconds: Number.isFinite(tolerance) ? tolerance : 60,
  });
}

export function expectedIssuer(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

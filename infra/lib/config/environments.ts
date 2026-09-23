import { Duration } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * Only the values that genuinely differ between environments live here.
 * Entra identifiers are supplied at synth time (env vars or CDK context) so
 * that the same code deploys any tenant/registration.
 */
export type EnvironmentName = 'dev' | 'test' | 'prod';

export interface EnvironmentConfig {
  name: EnvironmentName;
  account?: string;
  region: string;
  /** Browser origins allowed by Function URL CORS. Never "*". */
  allowedOrigins: string[];
  /** Optional custom domain for CloudFront, e.g. app.example.com. */
  domainName?: string;
  /** ACM certificate ARN in us-east-1 for domainName. */
  certificateArn?: string;
  /** Route 53 hosted zone for domainName (optional DNS record). */
  hostedZoneName?: string;
  logRetention: RetentionDays;
  /** Caps cost/abuse exposure of the public Function URL. */
  reservedConcurrency?: number;
  lambdaMemoryMb: number;
  lambdaTimeout: Duration;
  /** Email for CloudWatch alarm notifications (optional). */
  alarmEmail?: string;
  /** Protect stateful resources from accidental deletion. */
  retainData: boolean;
}

export interface EntraConfig {
  tenantId: string;
  clientId: string;
}

const region = process.env.CDK_DEFAULT_REGION ?? 'eu-west-1';
const account = process.env.CDK_DEFAULT_ACCOUNT;

export const ENVIRONMENTS: Record<EnvironmentName, EnvironmentConfig> = {
  dev: {
    name: 'dev',
    account,
    region,
    allowedOrigins: ['http://localhost:5173'],
    logRetention: RetentionDays.TWO_WEEKS,
    reservedConcurrency: undefined,
    lambdaMemoryMb: 512,
    lambdaTimeout: Duration.seconds(10),
    retainData: false,
  },
  test: {
    name: 'test',
    account,
    region,
    allowedOrigins: [],
    logRetention: RetentionDays.ONE_MONTH,
    reservedConcurrency: 10,
    lambdaMemoryMb: 512,
    lambdaTimeout: Duration.seconds(10),
    retainData: false,
  },
  prod: {
    name: 'prod',
    account,
    region,
    allowedOrigins: ['https://app.example.com'],
    domainName: 'app.example.com',
    logRetention: RetentionDays.THREE_MONTHS,
    reservedConcurrency: 50,
    lambdaMemoryMb: 1024,
    lambdaTimeout: Duration.seconds(10),
    retainData: true,
  },
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveEntraConfig(
  get: (key: string) => string | undefined,
): EntraConfig {
  const tenantId = get('ENTRA_TENANT_ID') ?? '';
  const clientId = get('ENTRA_CLIENT_ID') ?? '';
  const problems: string[] = [];
  if (!GUID.test(tenantId))
    problems.push('ENTRA_TENANT_ID must be a tenant GUID');
  if (!GUID.test(clientId)) problems.push('ENTRA_CLIENT_ID must be a GUID');
  if (problems.length > 0) {
    throw new Error(`Invalid Entra configuration: ${problems.join('; ')}`);
  }
  return { tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase() };
}

export function resolveEnvironment(
  name: string | undefined,
  overrides: {
    allowedOrigins?: string;
    domainName?: string;
    certificateArn?: string;
    hostedZoneName?: string;
    alarmEmail?: string;
  } = {},
): EnvironmentConfig {
  const key = (name ?? 'dev') as EnvironmentName;
  const base = ENVIRONMENTS[key];
  if (!base) {
    throw new Error(
      `Unknown environment "${name}". Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`,
    );
  }
  const config: EnvironmentConfig = {
    ...base,
    ...(overrides.allowedOrigins
      ? {
          allowedOrigins: overrides.allowedOrigins
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
        }
      : {}),
    ...(overrides.domainName ? { domainName: overrides.domainName } : {}),
    ...(overrides.certificateArn
      ? { certificateArn: overrides.certificateArn }
      : {}),
    ...(overrides.hostedZoneName
      ? { hostedZoneName: overrides.hostedZoneName }
      : {}),
    ...(overrides.alarmEmail ? { alarmEmail: overrides.alarmEmail } : {}),
  };
  validateOrigins(config);
  return config;
}

function validateOrigins(config: EnvironmentConfig): void {
  for (const origin of config.allowedOrigins) {
    if (origin === '*' || origin.includes('*')) {
      throw new Error(
        'Wildcard CORS origins are not permitted for the authenticated API',
      );
    }
    const url = new URL(origin);
    const isLocal =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocal && config.name === 'dev')) {
      throw new Error(
        `Origin ${origin} must use https (http is allowed only for localhost in dev)`,
      );
    }
    if (url.origin !== origin) {
      throw new Error(
        `Origin ${origin} must be a bare origin (scheme://host[:port])`,
      );
    }
  }
}

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App, Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { BackendStack } from '../lib/backend-stack.js';
import {
  resolveEntraConfig,
  resolveEnvironment,
} from '../lib/config/environments.js';
import { FrontendStack } from '../lib/frontend-stack.js';
import { ObservabilityStack } from '../lib/observability-stack.js';

const app = new App();
const ctx = (key: string): string | undefined =>
  (app.node.tryGetContext(key) as string | undefined) ?? process.env[key];

const config = resolveEnvironment(ctx('DEPLOY_ENV'), {
  allowedOrigins: ctx('ALLOWED_ORIGINS'),
  domainName: ctx('DOMAIN_NAME'),
  certificateArn: ctx('CERTIFICATE_ARN'),
  hostedZoneName: ctx('HOSTED_ZONE_NAME'),
  alarmEmail: ctx('ALARM_EMAIL'),
});
const entra = resolveEntraConfig(ctx);

const apiDist = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../apps/api/dist',
);
if (!existsSync(resolve(apiDist, 'index.mjs'))) {
  throw new Error(
    'API bundle missing — run `npm run build -w @friendly-funicular/api` first.',
  );
}

const env = { account: config.account, region: config.region };
const prefix = `FriendlyFunicular-${config.name}`;

const backend = new BackendStack(app, `${prefix}-Backend`, {
  env,
  config,
  entra,
  code: lambda.Code.fromAsset(apiDist),
});

// The apiUrl cross-stack reference orders Backend before Frontend.
new FrontendStack(app, `${prefix}-Frontend`, {
  env,
  config,
  entra,
  apiUrl: backend.functionUrl.url,
});

new ObservabilityStack(app, `${prefix}-Observability`, {
  env,
  config,
  apiFunction: backend.function,
  apiLogGroup: backend.logGroup,
});

Tags.of(app).add('project', 'friendly-funicular');
Tags.of(app).add('environment', config.name);

import { App } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { describe, expect, it } from 'vitest';
import { BackendStack } from '../lib/backend-stack.js';
import {
  resolveEntraConfig,
  resolveEnvironment,
  type EnvironmentConfig,
} from '../lib/config/environments.js';
import { FrontendStack } from '../lib/frontend-stack.js';
import { ObservabilityStack } from '../lib/observability-stack.js';

const entra = {
  tenantId: '11111111-2222-3333-4444-555555555555',
  clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
};
const env = { account: '123456789012', region: 'eu-west-1' };

function synth(config: EnvironmentConfig = resolveEnvironment('prod')) {
  const app = new App();
  const backend = new BackendStack(app, 'Backend', {
    env,
    config,
    entra,
    code: lambda.Code.fromInline('export const handler = async () => ({});'),
  });
  const frontend = new FrontendStack(app, 'Frontend', {
    env,
    config,
    entra,
    apiUrl: backend.functionUrl.url,
  });
  const observability = new ObservabilityStack(app, 'Observability', {
    env,
    config,
    apiFunction: backend.function,
    apiLogGroup: backend.logGroup,
  });
  return {
    backend: Template.fromStack(backend),
    backendStack: backend,
    frontend: Template.fromStack(frontend),
    frontendStack: frontend,
    observability: Template.fromStack(observability),
  };
}

describe('BackendStack', () => {
  const { backend } = synth();

  it('creates a Function URL with AuthType NONE by deliberate design', () => {
    backend.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
  });

  it('restricts CORS to approved origins — never "*"', () => {
    backend.hasResourceProperties('AWS::Lambda::Url', {
      Cors: {
        AllowOrigins: ['https://app.example.com'],
        AllowHeaders: Match.arrayWith(['authorization']),
        AllowCredentials: false,
      },
    });
    const urls = backend.findResources('AWS::Lambda::Url');
    expect(JSON.stringify(urls)).not.toContain('"*"');
  });

  it('constrains the public resource policy to Function URL invocation', () => {
    const permissions = Object.values(
      backend.findResources('AWS::Lambda::Permission'),
    );
    expect(permissions.length).toBeGreaterThan(0);
    for (const p of permissions) {
      const props = p.Properties as Record<string, unknown>;
      expect(props.Principal).toBe('*');
      const constrained =
        (props.Action === 'lambda:InvokeFunctionUrl' &&
          props.FunctionUrlAuthType === 'NONE') ||
        (props.Action === 'lambda:InvokeFunction' &&
          props.InvokedViaFunctionUrl === true);
      expect(constrained, JSON.stringify(props)).toBe(true);
    }
  });

  it('supplies Entra issuer/audience configuration to Lambda', () => {
    backend.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({
          ENTRA_TENANT_ID: entra.tenantId,
          ENTRA_CLIENT_ID: entra.clientId,
          REQUIRED_SCOPE: 'access_as_user',
        }),
      },
    });
  });

  it('never places secrets in Lambda environment variables', () => {
    const fns = backend.findResources('AWS::Lambda::Function');
    for (const fn of Object.values(fns)) {
      const vars = Object.keys(
        (
          fn.Properties as {
            Environment: { Variables: Record<string, string> };
          }
        ).Environment.Variables,
      );
      expect(vars.filter((v) => /SECRET|PASSWORD|KEY/i.test(v))).toEqual([]);
    }
  });

  it('sets reserved concurrency as an abuse/cost control in prod', () => {
    backend.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 50,
    });
  });

  it('configures log retention', () => {
    backend.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 90,
    });
  });

  it('follows least privilege — no wildcard actions or resources', () => {
    const policies = backend.findResources('AWS::IAM::Policy');
    for (const policy of Object.values(policies)) {
      const statements = (
        policy.Properties as {
          PolicyDocument: {
            Statement: { Action: unknown; Resource: unknown }[];
          };
        }
      ).PolicyDocument.Statement;
      for (const s of statements) {
        expect([s.Action].flat()).not.toContain('*');
        expect([s.Resource].flat()).not.toContain('*');
      }
    }
    const roles = backend.findResources('AWS::IAM::Role');
    expect(JSON.stringify(roles)).not.toMatch(
      /AdministratorAccess|PowerUserAccess/,
    );
  });
});

describe('FrontendStack', () => {
  const { frontend } = synth();

  it('blocks all public access and encrypts + versions the bucket', () => {
    frontend.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: 'Enabled' },
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.anyValue(),
      }),
    });
    frontend.resourceCountIs('AWS::S3::Bucket', 1);
  });

  it('does not enable S3 static website hosting', () => {
    const buckets = frontend.findResources('AWS::S3::Bucket');
    for (const b of Object.values(buckets)) {
      expect(
        (b.Properties as Record<string, unknown>).WebsiteConfiguration,
      ).toBeUndefined();
    }
  });

  it('uses CloudFront Origin Access Control', () => {
    frontend.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    frontend.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([
          Match.objectLike({ OriginAccessControlId: Match.anyValue() }),
        ]),
      }),
    });
  });

  it('serves HTTPS only with compression and the SPA rewrite', () => {
    frontend.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          Compress: true,
          FunctionAssociations: Match.arrayWith([
            Match.objectLike({ EventType: 'viewer-request' }),
          ]),
        }),
      }),
    });
  });

  it('applies security response headers', () => {
    frontend.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentSecurityPolicy: Match.objectLike({ Override: true }),
          ContentTypeOptions: { Override: true },
          ReferrerPolicy: Match.objectLike({
            ReferrerPolicy: 'strict-origin-when-cross-origin',
          }),
        }),
        CustomHeadersConfig: {
          Items: [Match.objectLike({ Header: 'Permissions-Policy' })],
        },
      }),
    });
  });

  it('only lets CloudFront read the bucket', () => {
    frontend.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
          }),
        ]),
      },
    });
  });
});

describe('ObservabilityStack', () => {
  const { observability } = synth();

  it('creates actionable alarms wired to SNS', () => {
    const alarms = observability.findResources('AWS::CloudWatch::Alarm');
    const names = Object.values(alarms).map(
      (a) => (a.Properties as { MetricName?: string }).MetricName,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'Errors',
        'Throttles',
        'Duration',
        'Url5xxCount',
        'AuthRejected',
        'ServerErrors',
        'Invocations',
      ]),
    );
    for (const a of Object.values(alarms)) {
      expect(
        (a.Properties as { AlarmActions: unknown[] }).AlarmActions,
      ).toHaveLength(1);
    }
  });

  it('derives authentication-failure metrics from structured logs', () => {
    observability.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '{ $.authOutcome = "rejected" }',
    });
  });

  it('creates a dashboard', () => {
    observability.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });
});

describe('environment configuration', () => {
  it('rejects wildcard or insecure CORS origins', () => {
    expect(() => resolveEnvironment('prod', { allowedOrigins: '*' })).toThrow(
      /Wildcard/,
    );
    expect(() =>
      resolveEnvironment('prod', { allowedOrigins: 'http://app.example.com' }),
    ).toThrow(/https/);
    expect(() =>
      resolveEnvironment('prod', { allowedOrigins: 'http://localhost:5173' }),
    ).toThrow(/https/);
    expect(resolveEnvironment('dev').allowedOrigins).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('rejects unknown environments and invalid Entra identifiers', () => {
    expect(() => resolveEnvironment('staging')).toThrow(/Unknown environment/);
    expect(() => resolveEntraConfig(() => 'common')).toThrow(/ENTRA_TENANT_ID/);
  });

  it('refuses to deploy a backend without CORS origins', () => {
    expect(() => synth(resolveEnvironment('test'))).toThrow(
      /no allowed CORS origins/,
    );
  });

  it('synthesizes dev without warnings or errors', () => {
    const { backendStack, frontendStack } = synth(resolveEnvironment('dev'));
    for (const stack of [backendStack, frontendStack]) {
      Annotations.fromStack(stack).hasNoError('*', Match.anyValue());
    }
  });
});

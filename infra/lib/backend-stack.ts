import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { EntraConfig, EnvironmentConfig } from './config/environments.js';

export interface BackendStackProps extends StackProps {
  config: EnvironmentConfig;
  entra: EntraConfig;
  /** Bundled API code. Defaults to apps/api/dist (run `npm run build -w @friendly-funicular/api`). */
  code: lambda.Code;
}

/**
 * Lambda + public Function URL (AuthType NONE by deliberate design). All
 * authentication happens inside the function via Entra JWT validation; the
 * Function URL provides HTTPS and CORS only.
 */
export class BackendStack extends Stack {
  readonly function: lambda.Function;
  readonly functionUrl: lambda.FunctionUrl;
  readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);
    const { config, entra } = props;

    this.logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: config.logRetention,
      removalPolicy: config.retainData
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
    });

    // The execution role gets only what the function uses today: writing to
    // its own log group (granted by CDK via `logGroup`). Add narrowly scoped
    // grants here when downstream resources are introduced.
    this.function = new lambda.Function(this, 'ApiFunction', {
      description: 'Entra-protected API behind a Lambda Function URL',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: props.code,
      memorySize: config.lambdaMemoryMb,
      timeout: config.lambdaTimeout,
      logGroup: this.logGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      systemLogLevelV2: lambda.SystemLogLevel.WARN,
      ...(config.reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: config.reservedConcurrency }
        : {}),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        SERVICE_NAME: 'friendly-funicular-api',
        DEPLOY_ENV: config.name,
        ENTRA_TENANT_ID: entra.tenantId,
        ENTRA_CLIENT_ID: entra.clientId,
        REQUIRED_SCOPE: 'access_as_user',
      },
    });

    if (config.allowedOrigins.length === 0) {
      throw new Error(
        `Environment ${config.name} has no allowed CORS origins configured`,
      );
    }

    // AuthType NONE: invocation is public by design; addFunctionUrl scopes
    // the resource policy to Function URL invocation only
    // (lambda:FunctionUrlAuthType = NONE, lambda:InvokedViaFunctionUrl).
    this.functionUrl = this.function.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedHeaders: ['authorization', 'content-type', 'x-correlation-id'],
        exposedHeaders: ['x-correlation-id', 'www-authenticate', 'retry-after'],
        allowCredentials: false,
        maxAge: Duration.hours(1),
      },
    });

    new CfnOutput(this, 'FunctionUrl', { value: this.functionUrl.url });
    new CfnOutput(this, 'FunctionName', { value: this.function.functionName });
  }
}

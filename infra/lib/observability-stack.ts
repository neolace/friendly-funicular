import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from './config/environments.js';

export interface ObservabilityStackProps extends StackProps {
  config: EnvironmentConfig;
  apiFunction: lambda.IFunction;
  apiLogGroup: logs.ILogGroup;
}

const NAMESPACE = 'FriendlyFunicular/Api';

/** Actionable alarms and a service dashboard for the Function URL API. */
export class ObservabilityStack extends Stack {
  readonly alarmTopic: sns.Topic;
  readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config, apiFunction: fn } = props;

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: `friendly-funicular ${config.name} alarms`,
      enforceSSL: true,
    });
    if (config.alarmEmail) {
      this.alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(config.alarmEmail),
      );
    }

    // Derived from the structured request log emitted by the API.
    const authRejected = new logs.MetricFilter(this, 'AuthRejectedFilter', {
      logGroup: props.apiLogGroup,
      filterPattern: logs.FilterPattern.stringValue(
        '$.authOutcome',
        '=',
        'rejected',
      ),
      metricNamespace: NAMESPACE,
      metricName: 'AuthRejected',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    const serverErrors = new logs.MetricFilter(this, 'ServerErrorFilter', {
      logGroup: props.apiLogGroup,
      filterPattern: logs.FilterPattern.numberValue('$.status', '>=', 500),
      metricNamespace: NAMESPACE,
      metricName: 'ServerErrors',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    const fnMetric = (metricName: string, statistic = 'Sum') =>
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName,
        dimensionsMap: { FunctionName: fn.functionName },
        statistic,
        period: Duration.minutes(5),
      });

    const invocations = fn.metricInvocations({ period: Duration.minutes(5) });
    const errors = fn.metricErrors({ period: Duration.minutes(5) });
    const throttles = fn.metricThrottles({ period: Duration.minutes(5) });
    const durationP95 = fn.metricDuration({
      statistic: 'p95',
      period: Duration.minutes(5),
    });
    const urlRequests = fnMetric('UrlRequestCount');
    const url4xx = fnMetric('Url4xxCount');
    const url5xx = fnMetric('Url5xxCount');

    const alarm = (
      id: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      description: string,
      evaluationPeriods = 1,
    ) => {
      const a = new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods,
        datapointsToAlarm: evaluationPeriods,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      });
      a.addAlarmAction(new actions.SnsAction(this.alarmTopic));
      a.addOkAction(new actions.SnsAction(this.alarmTopic));
      return a;
    };

    alarm(
      'ErrorsAlarm',
      errors,
      5,
      'Lambda invocation errors (unhandled exceptions/timeouts).',
      2,
    );
    alarm(
      'ThrottlesAlarm',
      throttles,
      1,
      'Lambda throttling — reserved concurrency may be exhausted (possible abuse).',
    );
    alarm(
      'DurationAlarm',
      durationP95,
      Math.floor(0.8 * config.lambdaTimeout.toMilliseconds()),
      'p95 duration above 80% of the configured timeout.',
      3,
    );
    alarm('Url5xxAlarm', url5xx, 5, 'Function URL 5xx responses.', 2);
    alarm(
      'ServerErrorsAlarm',
      serverErrors,
      5,
      'API responded with 5xx (from structured logs).',
      2,
    );
    alarm(
      'AuthRejectedAlarm',
      authRejected,
      100,
      'Unusual volume of rejected tokens — misconfiguration, token replay or probing.',
      2,
    );
    alarm(
      'InvocationSpikeAlarm',
      invocations,
      (config.reservedConcurrency ?? 50) * 600,
      'Invocation volume anomaly on the public Function URL (cost/abuse).',
    );

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `friendly-funicular-${config.name}`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Requests',
            left: [urlRequests, invocations],
            width: 12,
          }),
          new cloudwatch.GraphWidget({
            title: 'Duration (p95)',
            left: [durationP95],
            width: 12,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Errors',
            left: [errors, url5xx, serverErrors],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'Throttles',
            left: [throttles],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: 'Authentication failures',
            left: [authRejected, url4xx],
            width: 8,
          }),
        ],
      ],
    });

    new CfnOutput(this, 'AlarmTopicArn', { value: this.alarmTopic.topicArn });
  }
}

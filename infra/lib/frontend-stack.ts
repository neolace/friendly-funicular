import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EntraConfig, EnvironmentConfig } from './config/environments.js';

export interface FrontendStackProps extends StackProps {
  config: EnvironmentConfig;
  entra: EntraConfig;
  /** Lambda Function URL (https://<id>.lambda-url.<region>.on.aws/). */
  apiUrl: string;
}

/**
 * Private S3 origin + CloudFront (OAC) for the static SPA. S3 is never
 * publicly reachable; CloudFront is the only delivery path.
 */
export class FrontendStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: config.retainData
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      autoDeleteObjects: !config.retainData,
    });

    // "https://abc.lambda-url.eu-west-1.on.aws/" -> "https://abc.lambda-url.eu-west-1.on.aws"
    const apiOrigin = `https://${Fn.select(2, Fn.split('/', props.apiUrl))}`;
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ${apiOrigin} https://login.microsoftonline.com`,
      "frame-src 'self' https://login.microsoftonline.com",
      "frame-ancestors 'none'",
      "form-action 'self' https://login.microsoftonline.com",
      "base-uri 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ');

    const headers = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeaders',
      {
        comment: 'SPA security headers',
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            includeSubdomains: true,
            preload: false,
            override: true,
          },
          contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permissions-Policy',
              value:
                'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
              override: true,
            },
          ],
        },
      },
    );

    // Client-side routes (/reports, /login) resolve to index.html, while
    // requests for real files (anything with an extension) keep genuine 404s.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Rewrite extensionless SPA routes to /index.html',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          "  var last = request.uri.split('/').pop();",
          "  if (last.indexOf('.') === -1) { request.uri = '/index.html'; }",
          '  return request;',
          '}',
        ].join('\n'),
      ),
    });

    const certificate =
      config.domainName && config.certificateArn
        ? acm.Certificate.fromCertificateArn(
            this,
            'Certificate',
            config.certificateArn,
          )
        : undefined;

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `friendly-funicular web (${config.name})`,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      ...(certificate && config.domainName
        ? {
            certificate,
            domainNames: [config.domainName],
            minimumProtocolVersion:
              cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: headers,
        functionAssociations: [
          {
            function: spaRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });

    if (config.domainName && config.hostedZoneName && certificate) {
      const zone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: config.hostedZoneName,
      });
      new route53.ARecord(this, 'AliasRecord', {
        zone,
        recordName: config.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution),
        ),
      });
    }

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
    });
    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
    });
  }
}

import type { IConstruct } from "constructs";
import { NagSuppressions } from "cdk-nag";

const ALLOWED_MANAGED_POLICIES = [
  "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
  "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs",
  "Policy::arn:<AWS::Partition>:iam::aws:policy/AWSXRayDaemonWriteAccess",
];

export function applyIduraSuppressions(scope: IConstruct): void {
  NagSuppressions.addResourceSuppressions(
    scope,
    [
      {
        id: "AwsSolutions-L1",
        reason:
          "Idura pins Lambda runtimes to a specific Node major version, validates against it before deploy, and keeps up with runtime deprecations on our own cadence. The 'use latest runtime' nag does not align with that policy.",
      },
      {
        id: "AwsSolutions-IAM4",
        appliesTo: ALLOWED_MANAGED_POLICIES,
        reason:
          "These AWS-managed policies are accepted as a baseline at Idura: each grants only the privileges required for its specific service-role purpose (Lambda execution, Lambda execution in a VPC, API Gateway CloudWatch logging, X-Ray tracing).",
      },
    ],
    true,
  );
}

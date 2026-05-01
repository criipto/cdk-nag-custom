import { Stack, type CfnResource } from "aws-cdk-lib";
import { Role } from "aws-cdk-lib/aws-iam";
import {
  CfnFunction,
  Function as LambdaFunction,
} from "aws-cdk-lib/aws-lambda";
import { NagRuleCompliance } from "cdk-nag";

const EDGE_LAMBDA_PRINCIPAL = "edgelambda.amazonaws.com";

function isLambdaAtEdge(node: CfnFunction): boolean {
  const scope = node.node.scope;
  if (!(scope instanceof LambdaFunction)) return false;

  const role = scope.role;
  if (!(role instanceof Role)) return false;

  const policyDocument = role.assumeRolePolicy;
  if (!policyDocument) return false;

  const resolved = Stack.of(node).resolve(policyDocument) as
    | { Statement?: Array<{ Principal?: { Service?: string | string[] } }> }
    | undefined;

  const statements = resolved?.Statement ?? [];
  return statements.some((statement) => {
    const service = statement?.Principal?.Service;
    if (typeof service === "string") return service === EDGE_LAMBDA_PRINCIPAL;
    if (Array.isArray(service)) return service.includes(EDGE_LAMBDA_PRINCIPAL);
    return false;
  });
}

function lambdaExplicitLogGroup(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnFunction)) return NagRuleCompliance.NOT_APPLICABLE;

  // Lambda@Edge does not support a custom CloudWatch log group; log groups are
  // created automatically in each region the function executes in.
  if (isLambdaAtEdge(node)) return NagRuleCompliance.NOT_APPLICABLE;

  const loggingConfig = Stack.of(node).resolve(node.loggingConfig) as
    | CfnFunction.LoggingConfigProperty
    | undefined;

  if (!loggingConfig) return NagRuleCompliance.NON_COMPLIANT;

  const logGroup = Stack.of(node).resolve(loggingConfig.logGroup);
  if (logGroup === undefined || logGroup === null || logGroup === "") {
    return NagRuleCompliance.NON_COMPLIANT;
  }

  return NagRuleCompliance.COMPLIANT;
}

export default lambdaExplicitLogGroup;

import { Stack, type CfnResource } from "aws-cdk-lib";
import { Role } from "aws-cdk-lib/aws-iam";
import {
  CfnFunction,
  Function as LambdaFunction,
  SingletonFunction,
} from "aws-cdk-lib/aws-lambda";
import { NagRuleCompliance } from "cdk-nag";

const EDGE_LAMBDA_PRINCIPAL = "edgelambda.amazonaws.com";

function isLambdaAtEdge(scope: LambdaFunction): boolean {
  const role = scope.role;
  if (!(role instanceof Role)) return false;

  const policyDocument = role.assumeRolePolicy;
  if (!policyDocument) return false;

  const resolved = Stack.of(scope).resolve(policyDocument) as
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

function isSingletonBacked(scope: LambdaFunction): boolean {
  // SingletonFunction creates its inner `Function` at Stack scope with id equal
  // to its public `constructName`. Find a SingletonFunction in the stack whose
  // inner Function is this scope.
  const stack = Stack.of(scope);
  for (const construct of stack.node.findAll()) {
    if (!(construct instanceof SingletonFunction)) continue;
    if (stack.node.tryFindChild(construct.constructName) === scope) return true;
  }
  return false;
}

function lambdaExplicitLogGroup(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnFunction)) return NagRuleCompliance.NOT_APPLICABLE;

  // Only flag user-controllable lambdas. CDK-internal helper classes that
  // create `CfnResource` (not `CfnFunction`) directly — e.g. aws-logs'
  // LogRetentionFunction — are already excluded by the check above.
  const scope = node.node.scope;
  if (!(scope instanceof LambdaFunction)) return NagRuleCompliance.NOT_APPLICABLE;

  // Lambdas owned by a `SingletonFunction` wrapper (AwsCustomResource,
  // BucketDeployment, and other CDK helper constructs) are framework-managed.
  if (isSingletonBacked(scope)) return NagRuleCompliance.NOT_APPLICABLE;

  // Lambda@Edge does not support a custom CloudWatch log group; log groups are
  // created automatically in each region the function executes in.
  if (isLambdaAtEdge(scope)) return NagRuleCompliance.NOT_APPLICABLE;

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

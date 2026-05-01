import { Stack, type CfnResource } from "aws-cdk-lib";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { NagRuleCompliance } from "cdk-nag";

function lambdaExplicitLogGroup(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnFunction)) return NagRuleCompliance.NOT_APPLICABLE;

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

import { CfnDeletionPolicy, Stack, type CfnResource } from "aws-cdk-lib";
import { CfnFunction, CfnVersion } from "aws-cdk-lib/aws-lambda";
import { NagRuleCompliance } from "cdk-nag";

const RETAINING_POLICIES: ReadonlySet<CfnDeletionPolicy> = new Set([
  CfnDeletionPolicy.RETAIN,
  CfnDeletionPolicy.RETAIN_EXCEPT_ON_CREATE,
]);

/**
 * Find every `AWS::Lambda::Version` in the stack that points at this function.
 *
 * The version is not a property of the function: `Function.currentVersion`
 * lazily creates a sibling `Version` construct (`<Fn>/CurrentVersion`), and a
 * `Version` can also be declared standalone against an existing function.
 * Matching on the resolved `functionName` covers both.
 */
function findVersions(node: CfnFunction): CfnVersion[] {
  const stack = Stack.of(node);
  const functionRef = JSON.stringify(stack.resolve(node.ref));

  return stack.node
    .findAll()
    .filter(
      (construct): construct is CfnVersion => construct instanceof CfnVersion,
    )
    .filter(
      (version) =>
        JSON.stringify(stack.resolve(version.functionName)) === functionRef,
    );
}

/**
 * Durable functions must be configured to retain versions,
 * otherwise CDK will attempt to delete them, which is not necessarily possible
 * as they could be running workflows.
 */
function durableFunctionRetainVersions(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnFunction)) return NagRuleCompliance.NOT_APPLICABLE;

  const durableConfig = Stack.of(node).resolve(node.durableConfig) as
    | CfnFunction.DurableConfigProperty
    | undefined;

  if (!durableConfig) return NagRuleCompliance.NOT_APPLICABLE;

  const versions = findVersions(node);

  // Durable functions must be versioned.
  if (versions.length === 0) return NagRuleCompliance.NON_COMPLIANT;

  // Version logical ids include a hash of the function config, so a new version
  // resource replaces the previous one on every change. Without a retaining
  // deletion policy CloudFormation deletes the outgoing version, which fails
  // (or blocks) while it still has running executions.
  const allRetained = versions.every(
    (version) =>
      version.cfnOptions.deletionPolicy !== undefined &&
      RETAINING_POLICIES.has(version.cfnOptions.deletionPolicy),
  );

  return allRetained
    ? NagRuleCompliance.COMPLIANT
    : NagRuleCompliance.NON_COMPLIANT;
}

export default durableFunctionRetainVersions;

import { CfnResource } from "aws-cdk-lib";
import type { IConstruct } from "constructs";
import { NagMessageLevel, NagPack, type NagPackProps } from "cdk-nag";

import lambdaExplicitLogGroup from "./rules/lambda/lambda-explicit-log-group";

export class IduraChecks extends NagPack {
  constructor(props: NagPackProps = {}) {
    super(props);
    this.packName = "Idura";
  }

  override visit(node: IConstruct): void {
    if (!(node instanceof CfnResource)) return;

    this.applyRule({
      ruleSuffixOverride: "LambdaExplicitLogGroup",
      info: "Lambda functions must reference an explicitly created CloudWatch log group via LoggingConfig.LogGroup.",
      explanation:
        "Without an explicit log group, Lambda creates an implicit '/aws/lambda/<function-name>' log group on first invocation. That implicit log group is not part of the stack, so it is not deleted when the function is deleted, leaving an orphaned log group (and storage cost) behind. Pass a logs.LogGroup to the function's logGroup prop so the log group is part of the stack and gets cleaned up with the function.",
      level: NagMessageLevel.ERROR,
      rule: lambdaExplicitLogGroup,
      node,
    });
  }
}

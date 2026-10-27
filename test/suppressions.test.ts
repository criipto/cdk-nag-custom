import { describe, it } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { AwsSolutionsChecks } from "cdk-nag";

import { applyIduraSuppressions } from "../src/suppressions";
import { NagFindings } from "./nag";

function makeStack(opts: { applySuppressions: boolean }): NagFindings {
  const app = new App();
  const stack = new Stack(app, "TestStack");

  new LambdaFunction(stack, "Fn", {
    runtime: Runtime.NODEJS_18_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = async () => ({});"),
  });

  if (opts.applySuppressions) {
    applyIduraSuppressions(stack);
  }
  return NagFindings.of(stack, new AwsSolutionsChecks());
}

describe("applyIduraSuppressions", () => {
  it("baseline: AwsSolutions-L1 fires for an outdated Lambda runtime when no suppressions are applied", () => {
    const findings = makeStack({ applySuppressions: false });
    findings.hasError("/TestStack/Fn/Resource", "AwsSolutions-L1");
  });

  it("baseline: AwsSolutions-IAM4 fires for the default Lambda role (uses AWSLambdaBasicExecutionRole) when no suppressions are applied", () => {
    const findings = makeStack({ applySuppressions: false });
    findings.hasError(
      "/TestStack/Fn/ServiceRole/Resource",
      "AwsSolutions-IAM4\\[.*AWSLambdaBasicExecutionRole\\]",
    );
  });

  it("silences AwsSolutions-L1 once applied", () => {
    const findings = makeStack({ applySuppressions: true });
    findings.hasNoError("/TestStack/Fn/Resource", "AwsSolutions-L1");
  });

  it("silences AwsSolutions-IAM4 for AWSLambdaBasicExecutionRole once applied", () => {
    const findings = makeStack({ applySuppressions: true });
    findings.hasNoError(
      "/TestStack/Fn/ServiceRole/Resource",
      "AwsSolutions-IAM4",
    );
  });
});

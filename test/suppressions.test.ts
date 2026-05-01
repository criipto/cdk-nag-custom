import { describe, it } from "vitest";
import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { AwsSolutionsChecks } from "cdk-nag";

import { applyIduraSuppressions } from "../src/suppressions";

function makeStack(opts: { applySuppressions: boolean }): Annotations {
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
  Aspects.of(stack).add(new AwsSolutionsChecks());
  return Annotations.fromStack(stack);
}

describe("applyIduraSuppressions", () => {
  it("baseline: AwsSolutions-L1 fires for an outdated Lambda runtime when no suppressions are applied", () => {
    const annotations = makeStack({ applySuppressions: false });
    annotations.hasError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp("AwsSolutions-L1"),
    );
  });

  it("baseline: AwsSolutions-IAM4 fires for the default Lambda role (uses AWSLambdaBasicExecutionRole) when no suppressions are applied", () => {
    const annotations = makeStack({ applySuppressions: false });
    annotations.hasError(
      "/TestStack/Fn/ServiceRole/Resource",
      Match.stringLikeRegexp("AwsSolutions-IAM4"),
    );
  });

  it("silences AwsSolutions-L1 once applied", () => {
    const annotations = makeStack({ applySuppressions: true });
    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp("AwsSolutions-L1"),
    );
  });

  it("silences AwsSolutions-IAM4 for AWSLambdaBasicExecutionRole once applied", () => {
    const annotations = makeStack({ applySuppressions: true });
    annotations.hasNoError(
      "/TestStack/Fn/ServiceRole/Resource",
      Match.stringLikeRegexp("AwsSolutions-IAM4"),
    );
  });
});

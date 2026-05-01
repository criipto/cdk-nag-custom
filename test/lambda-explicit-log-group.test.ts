import { describe, it } from "vitest";
import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

import { IduraChecks } from "../src/pack";

const RULE = "Idura-LambdaExplicitLogGroup";

function synth(build: (stack: Stack) => void): Annotations {
  const app = new App();
  const stack = new Stack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  build(stack);
  Aspects.of(stack).add(new IduraChecks());
  return Annotations.fromStack(stack);
}

describe("LambdaExplicitLogGroup", () => {
  it("flags a Lambda created without a logGroup prop", () => {
    const annotations = synth((stack) => {
      new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
      });
    });

    annotations.hasError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("still flags a Lambda that only sets logRetention (no explicit logGroup)", () => {
    const annotations = synth((stack) => {
      new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        logRetention: RetentionDays.ONE_WEEK,
      });
    });

    annotations.hasError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("does not flag a Lambda@Edge function (log groups cannot be configured)", () => {
    const annotations = synth((stack) => {
      new experimental.EdgeFunction(stack, "EdgeFn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
      });
    });

    annotations.hasNoError(
      "/TestStack/EdgeFn/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("passes when the Lambda is given an explicit logGroup", () => {
    const annotations = synth((stack) => {
      const logGroup = new LogGroup(stack, "FnLogs", {
        logGroupName: "/aws/lambda/explicit-fn",
      });
      new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        logGroup,
      });
    });

    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });
});

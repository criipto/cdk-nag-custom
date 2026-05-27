import { describe, expect, it } from "vitest";
import { App, Aspects, CustomResource, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, Provider } from "aws-cdk-lib/custom-resources";

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

  // Provider creates its own framework-onEvent Lambda wrapping the user's
  // onEventHandler — a separate Function with its own orphan-log-group
  // problem. Users fix the violation by passing `logGroup` to ProviderProps,
  // which createFunction forwards to every framework Lambda.
  it("flags the framework-onEvent wrapper of a custom-resources Provider", () => {
    const annotations = synth((stack) => {
      const onEvent = new LambdaFunction(stack, "OnEventFn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        logGroup: new LogGroup(stack, "OnEventFnLogs", {
          logGroupName: "/aws/lambda/on-event",
        }),
      });
      const provider = new Provider(stack, "Provider", { onEventHandler: onEvent });
      new CustomResource(stack, "Resource", { serviceToken: provider.serviceToken });
    });

    annotations.hasError(
      "/TestStack/Provider/framework-onEvent/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("does not flag the Lambda inside an AwsCustomResource", () => {
    const annotations = synth((stack) => {
      new AwsCustomResource(stack, "AwsCr", {
        onCreate: {
          service: "S3",
          action: "ListBuckets",
          physicalResourceId: PhysicalResourceId.of("static"),
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });
    });

    const errors = annotations.findError("*", Match.stringLikeRegexp(RULE));
    expect(errors).toHaveLength(0);
  });

  it("does not flag the BucketDeployment framework singleton lambda", () => {
    const annotations = synth((stack) => {
      const bucket = new Bucket(stack, "Bucket");
      new BucketDeployment(stack, "Deploy", {
        sources: [Source.data("hello.txt", "hi")],
        destinationBucket: bucket,
      });
    });

    const errors = annotations.findError("*", Match.stringLikeRegexp(RULE));
    expect(errors).toHaveLength(0);
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

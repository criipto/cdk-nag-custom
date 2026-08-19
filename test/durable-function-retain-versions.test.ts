import { describe, expect, it } from "vitest";
import { App, Aspects, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
  Version,
} from "aws-cdk-lib/aws-lambda";

import { IduraChecks } from "../src/pack";

const RULE = "Idura-DurableLambdaRetainVersions";

function synth(build: (stack: Stack) => void): Annotations {
  const app = new App();
  const stack = new Stack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  build(stack);
  Aspects.of(stack).add(new IduraChecks());
  return Annotations.fromStack(stack);
}

describe("DurableLambdaRetainVersions", () => {
  it("flags a Lambda created with durable but without currentVersionOptions", () => {
    const annotations = synth((stack) => {
      new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        durableConfig: {
          executionTimeout: Duration.hours(1),
        },
      });
    });

    annotations.hasError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("passes when the Lambda is configured to retain versions", () => {
    const annotations = synth((stack) => {
      const node = new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        durableConfig: {
          executionTimeout: Duration.hours(1),
        },
        currentVersionOptions: {
          removalPolicy: RemovalPolicy.RETAIN,
        },
      });
      node.currentVersion.functionArn;
    });

    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("passes when the Lambda is does not have durable config", () => {
    const annotations = synth((stack) => {
      new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
      });
    });

    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });
  it("flags a durable Lambda whose current version is not retained", () => {
    const annotations = synth((stack) => {
      const fn = new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        durableConfig: {
          executionTimeout: Duration.hours(1),
        },
      });
      fn.currentVersion.functionArn;
    });

    annotations.hasError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("passes when a retained standalone version points at the function", () => {
    const annotations = synth((stack) => {
      const fn = new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        durableConfig: {
          executionTimeout: Duration.hours(1),
        },
      });
      const version = new Version(stack, "Version", { lambda: fn });
      version.applyRemovalPolicy(RemovalPolicy.RETAIN);
    });

    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("ignores a non-durable Lambda without a retained version", () => {
    const annotations = synth((stack) => {
      const fn = new LambdaFunction(stack, "Fn", {
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
      });
      fn.currentVersion.functionArn;
    });

    annotations.hasNoError(
      "/TestStack/Fn/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });
});

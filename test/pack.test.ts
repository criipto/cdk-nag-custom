import { describe, expect, it } from "vitest";
import { App, Stack, Validations } from "aws-cdk-lib";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";

import { IduraChecks } from "../src/pack";

/**
 * Synthesize through CDK's policy validation framework, the way consumers
 * register the pack. Synthesis throws when the pack reports a violation.
 */
function synth(build: (stack: Stack) => void): () => void {
  const app = new App();
  build(new Stack(app, "TestStack"));
  Validations.of(app).addPlugins(new IduraChecks(app));
  return () => app.synth();
}

function addFunction(stack: Stack): LambdaFunction {
  return new LambdaFunction(stack, "Fn", {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = async () => ({});"),
  });
}

describe("IduraChecks as a validation plugin", () => {
  it("fails synthesis on a violation", () => {
    expect(synth(addFunction)).toThrow(
      /TestStack\/Fn\/Resource[\s\S]*Idura-LambdaExplicitLogGroup/,
    );
  });

  it("honours acknowledgments recorded with Validations.acknowledge", () => {
    const run = synth((stack) => {
      Validations.of(addFunction(stack)).acknowledge({
        id: "Idura-LambdaExplicitLogGroup",
        reason: "test",
      });
    });

    expect(run).not.toThrow();
  });
});

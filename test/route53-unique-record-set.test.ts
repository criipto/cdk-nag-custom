import { describe, expect, it } from "vitest";
import { App, Aspects, NestedStack, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import {
  AaaaRecord,
  ARecord,
  CfnRecordSet,
  HostedZone,
  RecordTarget,
  TxtRecord,
} from "aws-cdk-lib/aws-route53";

import { IduraChecks } from "../src/pack";

const RULE = "Idura-Route53UniqueRecordSet";

function synth(build: (stack: Stack) => void): Annotations {
  const app = new App();
  const stack = new Stack(app, "TestStack", {
    env: { account: "123456789012", region: "eu-west-1" },
  });
  build(stack);
  Aspects.of(stack).add(new IduraChecks());
  return Annotations.fromStack(stack);
}

function zoneOf(stack: Stack, id = "Zone", hostedZoneId = "Z123") {
  return HostedZone.fromHostedZoneAttributes(stack, id, {
    hostedZoneId,
    zoneName: "example.com",
  });
}

describe("Route53UniqueRecordSet", () => {
  it("flags both TXT records that share a name in the same zone", () => {
    const annotations = synth((stack) => {
      const zone = zoneOf(stack);
      new TxtRecord(stack, "Verify1", {
        zone,
        recordName: "_verify",
        values: ["token-a"],
      });
      new TxtRecord(stack, "Verify2", {
        zone,
        recordName: "_verify",
        values: ["token-b"],
      });
    });

    annotations.hasError(
      "/TestStack/Verify1/Resource",
      Match.stringLikeRegexp(RULE),
    );
    annotations.hasError(
      "/TestStack/Verify2/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });

  it("names the conflicting record in the finding", () => {
    const annotations = synth((stack) => {
      const zone = zoneOf(stack);
      new TxtRecord(stack, "Verify1", {
        zone,
        recordName: "_verify",
        values: ["token-a"],
      });
      new TxtRecord(stack, "Verify2", {
        zone,
        recordName: "_verify",
        values: ["token-b"],
      });
    });

    annotations.hasError(
      "/TestStack/Verify1/Resource",
      Match.stringLikeRegexp("TestStack/Verify2/Resource"),
    );
  });

  it("does not flag TXT records at different names in the same zone", () => {
    const annotations = synth((stack) => {
      const zone = zoneOf(stack);
      new TxtRecord(stack, "Spf", { zone, values: ["v=spf1 -all"] });
      new TxtRecord(stack, "Verify", {
        zone,
        recordName: "_verify",
        values: ["token-a"],
      });
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp(RULE)),
    ).toHaveLength(0);
  });

  it("does not flag an A and an AAAA record at the same name", () => {
    const annotations = synth((stack) => {
      const zone = zoneOf(stack);
      new ARecord(stack, "Ipv4", {
        zone,
        target: RecordTarget.fromIpAddresses("192.0.2.1"),
      });
      new AaaaRecord(stack, "Ipv6", {
        zone,
        target: RecordTarget.fromIpAddresses("2001:db8::1"),
      });
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp(RULE)),
    ).toHaveLength(0);
  });

  it("flags names that differ only by trailing dot and case", () => {
    const annotations = synth((stack) => {
      new CfnRecordSet(stack, "Raw1", {
        hostedZoneId: "Z123",
        name: "_verify.example.com.",
        type: "TXT",
        ttl: "300",
        resourceRecords: ['"token-a"'],
      });
      new CfnRecordSet(stack, "Raw2", {
        hostedZoneId: "Z123",
        name: "_VERIFY.Example.com",
        type: "txt",
        ttl: "300",
        resourceRecords: ['"token-b"'],
      });
    });

    annotations.hasError("/TestStack/Raw1", Match.stringLikeRegexp(RULE));
    annotations.hasError("/TestStack/Raw2", Match.stringLikeRegexp(RULE));
  });

  it("does not flag a weighted group distinguished by setIdentifier", () => {
    const annotations = synth((stack) => {
      const zone = zoneOf(stack);
      new ARecord(stack, "Blue", {
        zone,
        recordName: "api",
        target: RecordTarget.fromIpAddresses("192.0.2.1"),
        weight: 50,
      });
      new ARecord(stack, "Green", {
        zone,
        recordName: "api",
        target: RecordTarget.fromIpAddresses("192.0.2.2"),
        weight: 50,
      });
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp(RULE)),
    ).toHaveLength(0);
  });

  it("does not flag the same record name in two different hosted zones", () => {
    const annotations = synth((stack) => {
      const zoneA = zoneOf(stack, "ZoneA", "Z111");
      const zoneB = zoneOf(stack, "ZoneB", "Z222");
      new TxtRecord(stack, "VerifyA", {
        zone: zoneA,
        recordName: "_verify",
        values: ["token-a"],
      });
      new TxtRecord(stack, "VerifyB", {
        zone: zoneB,
        recordName: "_verify",
        values: ["token-b"],
      });
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp(RULE)),
    ).toHaveLength(0);
  });

  // A nested stack is not its own cloud assembly artifact, so findings on its
  // constructs surface on the parent stack's annotations.
  it("flags a nested-stack record colliding with one in its parent", () => {
    const annotations = synth((parent) => {
      const zone = new HostedZone(parent, "Zone", { zoneName: "example.com" });
      new TxtRecord(parent, "TxtSpf", { zone, values: ["token-a"] });
      const nested = new NestedStack(parent, "Nested");
      new TxtRecord(nested, "NoMailSpf", { zone, values: ["v=spf1 -all"] });
    });

    annotations.hasError(
      "/TestStack/TxtSpf/Resource",
      Match.stringLikeRegexp("TestStack/Nested/NoMailSpf/Resource"),
    );
    annotations.hasError(
      "/TestStack/Nested/NoMailSpf/Resource",
      Match.stringLikeRegexp("TestStack/TxtSpf/Resource"),
    );
  });

  it("flags a collision between two sibling nested stacks", () => {
    const annotations = synth((parent) => {
      const zone = new HostedZone(parent, "Zone", { zoneName: "example.com" });
      new TxtRecord(new NestedStack(parent, "Left"), "Spf", {
        zone,
        values: ["token-a"],
      });
      new TxtRecord(new NestedStack(parent, "Right"), "Spf", {
        zone,
        values: ["token-b"],
      });
    });

    annotations.hasError(
      "/TestStack/Left/Spf/Resource",
      Match.stringLikeRegexp("TestStack/Right/Spf/Resource"),
    );
    annotations.hasError(
      "/TestStack/Right/Spf/Resource",
      Match.stringLikeRegexp("TestStack/Left/Spf/Resource"),
    );
  });

  it("does not flag a nested stack that owns its own hosted zone", () => {
    const annotations = synth((parent) => {
      const parentZone = new HostedZone(parent, "Zone", {
        zoneName: "example.com",
      });
      new TxtRecord(parent, "TxtSpf", {
        zone: parentZone,
        values: ["token-a"],
      });
      const nested = new NestedStack(parent, "Nested");
      // Same zone name, but a separate hosted zone, so a separate record.
      const ownZone = new HostedZone(nested, "OwnZone", {
        zoneName: "example.com",
      });
      new TxtRecord(nested, "OwnSpf", { zone: ownZone, values: ["token-b"] });
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp(RULE)),
    ).toHaveLength(0);
  });

  it("does not compare records across separate top-level stacks", () => {
    const app = new App();
    const env = { account: "123456789012", region: "eu-west-1" };
    const stacks = ["StageA", "StageB"].map((id) => {
      const stack = new Stack(app, id, { env });
      new CfnRecordSet(stack, "Spf", {
        hostedZoneId: "Z123",
        name: "example.com.",
        type: "TXT",
        ttl: "300",
        resourceRecords: ['"v=spf1 -all"'],
      });
      return stack;
    });
    Aspects.of(app).add(new IduraChecks());

    for (const stack of stacks) {
      expect(
        Annotations.fromStack(stack).findError(
          "*",
          Match.stringLikeRegexp(RULE),
        ),
      ).toHaveLength(0);
    }
  });

  it("flags duplicates whose zone is referenced through the same token", () => {
    const annotations = synth((stack) => {
      const zone = new HostedZone(stack, "Zone", { zoneName: "example.com" });
      new TxtRecord(stack, "Verify1", {
        zone,
        recordName: "_verify",
        values: ["token-a"],
      });
      new TxtRecord(stack, "Verify2", {
        zone,
        recordName: "_verify",
        values: ["token-b"],
      });
    });

    annotations.hasError(
      "/TestStack/Verify1/Resource",
      Match.stringLikeRegexp(RULE),
    );
    annotations.hasError(
      "/TestStack/Verify2/Resource",
      Match.stringLikeRegexp(RULE),
    );
  });
});

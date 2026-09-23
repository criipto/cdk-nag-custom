# cdk-nag-custom

A collection of custom CDK nag rules used by Idura

## Usage

Add the pack as an aspect on the scope you want checked (typically the app or a specific stack), and call `applyIduraSuppressions` on the same scope to silence findings we've accepted as baseline org-wide:

```ts
import { App, Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { IduraChecks, applyIduraSuppressions } from "@idura.eu/cdk-nag-custom";

const app = new App();
// ... define stacks ...

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new IduraChecks());
applyIduraSuppressions(app);
```

## Rules

### `Idura-LambdaExplicitLogGroup` (error)

Lambda functions must reference an explicitly created CloudWatch log group via `LoggingConfig.LogGroup`. Without one, Lambda creates an implicit `/aws/lambda/<function-name>` log group on first invocation that is not part of the stack, so it outlives the function and keeps costing storage. Framework-managed lambdas (`SingletonFunction`-backed helpers such as `AwsCustomResource` and `BucketDeployment`) and Lambda@Edge functions are exempt.

### `Idura-DurableLambdaRetainVersions` (error)

A Lambda function with a `DurableConfig` must have at least one `AWS::Lambda::Version` pointing at it, and every such version must carry a `Retain` or `RetainExceptOnCreate` deletion policy. A version's logical id embeds a hash of the function config, so any change replaces the version resource — and deleting the outgoing version fails or stalls while durable executions are still running on it. Functions without a `DurableConfig` are not applicable.

### `Idura-Route53UniqueRecordSet` (error)

No two Route 53 record sets in the same stack (or its nested stacks) may address the same hosted zone, name, type and set identifier. CloudFormation provisions every `AWS::Route53::RecordSet` as an [UPSERT](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html), so a second record set at the same address updates the first instead of failing: the stack deploys green and only the last one written survives. The typical fix is one record set with several values (one `TxtRecord` with multiple entries in `values`) rather than several record sets. Records that intentionally share a name and type — weighted, latency, failover, geolocation, multivalue-answer — are exempt because Route 53 requires a distinct `SetIdentifier` for each.

The finding names the conflicting record's construct path, so both halves of the collision are visible: `Idura-Route53UniqueRecordSet[MyStack/Verify2/Resource]`.

Comparison covers a top-level stack together with all of its nested stacks — a nested stack deploys its own change set, but Route 53 has no such boundary, so an UPSERT from a nested stack overwrites an identically addressed record from its parent just the same. Records are therefore all resolved in the top-level stack's scope, because the same hosted zone reads as a different intrinsic in each template. Separate top-level stacks are deliberately not compared: a multi-stage app can legitimately repeat the same literal zone and record name once per stage.

Because comparison uses resolved values, these collisions are **not** detected: records in two separate top-level stacks; a record addressing its zone by `hostedZoneId` colliding with one using `hostedZoneName`; and two structurally different tokens that happen to resolve to the same name at deploy time. Records declared inside a `CfnRecordSetGroup` are not checked at all — no CDK L2 emits one.

## Suppressions

`applyIduraSuppressions` silences these `AwsSolutions` findings:

- **`AwsSolutions-L1`** — Lambda runtime not latest. We pin Lambda runtimes to specific Node majors, validate against them before deploy, and keep up with deprecations on our own cadence.
- **`AwsSolutions-IAM4`**, scoped via `appliesTo` to these AWS-managed policies: `AWSLambdaBasicExecutionRole`, `AWSLambdaVPCAccessExecutionRole`, `AmazonAPIGatewayPushToCloudWatchLogs`, `AWSXRayDaemonWriteAccess`. Each grants only the minimum privileges for its specific service-role purpose.

If a stack needs additional suppressions, layer them with `NagSuppressions.addResourceSuppressions(...)` as usual — the helper does not preempt or replace anything.

## Local development

### Testing changes in a consumer project

Use `pnpm pack`, not `pnpm link`:

```sh
# In this repo
pnpm build && pnpm pack

# In the consumer project
pnpm add /absolute/path/to/idura.eu-cdk-nag-custom-x.y.z.tgz
```

`pnpm link` does not work reliably for this package. The rules use `instanceof CfnResource` / `instanceof CfnFunction` to identify resources, which compares class identity. When pnpm links a package, the linked package keeps its own copy of `aws-cdk-lib` in its `node_modules` — that's a different class object from the consumer's `aws-cdk-lib`, so `instanceof` returns `false` on every node and the rules silently no-op.

`pnpm pack` + install respects peer dependencies and resolves to a single `aws-cdk-lib` in the consumer's tree. The same issue can appear in workspaces or any setup where multiple versions of `aws-cdk-lib` coexist; the fix is the same — ensure a single copy is installed at the top level.

## Releasing

1. Bump the version on `master`: `pnpm version patch` (or `minor` / `major`). This commits the version change and creates a `v<version>` git tag.
2. Push: `git push --follow-tags`. The `Publish` workflow runs on the tag and publishes to npm via OIDC trusted publishing — no `NPM_TOKEN` secret required.

The workflow verifies that the tag matches `package.json`'s version, runs `typecheck` + `test`, and then publishes with `--provenance` via `npm publish` (which runs `prepublishOnly` → `pnpm build`).

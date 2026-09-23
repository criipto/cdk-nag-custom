import { Stack, type CfnResource } from "aws-cdk-lib";
import { CfnRecordSet } from "aws-cdk-lib/aws-route53";
import { NagRuleCompliance, type NagRuleResult } from "cdk-nag";

/**
 * Route 53 treats domain names as case-insensitive and the trailing dot as
 * implied, so `Example.COM.` and `example.com` address the same node.
 */
function normalizeDomainName(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/\.$/, "").toLowerCase();
}

function normalizeRecordType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.toUpperCase();
}

/**
 * A nested stack deploys its own change set, but Route 53 has no such
 * boundary: an UPSERT from a nested stack overwrites an identically addressed
 * record from its parent just the same. Comparing records across the whole
 * tree means resolving them all in one scope, because the same hosted zone
 * reads as a different intrinsic in each template — `{"Ref":"Zone..."}` in the
 * parent, `{"Ref":"referencetoParentZone...Ref"}` in the nested stack.
 */
function comparisonScope(record: CfnRecordSet): Stack {
  let stack = Stack.of(record);
  while (stack.nestedStackParent) stack = stack.nestedStackParent;
  return stack;
}

/**
 * The tuple Route 53 uses to address a resource record set. Unresolved values
 * are compared by their resolved CloudFormation intrinsic, so two record sets
 * whose names are built from the same token compare equal.
 */
function recordSetIdentity(record: CfnRecordSet, scope: Stack): string {
  return JSON.stringify([
    scope.resolve(record.hostedZoneId) ?? null,
    normalizeDomainName(scope.resolve(record.hostedZoneName)) ?? null,
    normalizeDomainName(scope.resolve(record.name)) ?? null,
    normalizeRecordType(scope.resolve(record.type)) ?? null,
    // Weighted, latency, failover, geolocation and multivalue-answer records
    // share a name and type by design and are distinguished by SetIdentifier.
    scope.resolve(record.setIdentifier) ?? null,
  ]);
}

function route53UniqueRecordSet(node: CfnResource): NagRuleResult {
  if (!(node instanceof CfnRecordSet)) return NagRuleCompliance.NOT_APPLICABLE;

  const scope = comparisonScope(node);
  const identity = recordSetIdentity(node, scope);

  const conflicts = scope.node
    .findAll()
    .filter(
      (other): other is CfnRecordSet =>
        other !== node &&
        other instanceof CfnRecordSet &&
        // Separate top-level stacks are left alone: a multi-stage app can
        // legitimately repeat the same literal zone and record name per stage.
        comparisonScope(other) === scope,
    )
    .filter((other) => recordSetIdentity(other, scope) === identity)
    .map((other) => other.node.path);

  if (conflicts.length > 0) return conflicts;

  return NagRuleCompliance.COMPLIANT;
}

export default route53UniqueRecordSet;

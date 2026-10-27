import { expect } from "vitest";
import { Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import type { IConstruct } from "constructs";
import type { NagPack } from "cdk-nag";

interface Finding {
  readonly path: string;
  readonly ruleName: string;
  readonly severity: string;
}

/**
 * Runs a pack over `scope` and exposes its findings by construct path and
 * rule id, so tests don't depend on how the pack reports them. Paths are
 * written with a leading slash, as `Annotations` expects them.
 */
export class NagFindings {
  static of(scope: IConstruct, pack: NagPack): NagFindings {
    Aspects.of(scope).add(pack);
    const stacks = scope.node
      .findAll()
      .filter(
        (construct): construct is Stack =>
          Stack.isStack(construct) && !construct.nestedStackParent,
      );
    return new NagFindings(
      stacks.flatMap((stack) => {
        const annotations = Annotations.fromStack(stack);
        return [
          ...toFindings(annotations.findError("*", Match.anyValue()), "error"),
          ...toFindings(
            annotations.findWarning("*", Match.anyValue()),
            "warning",
          ),
        ];
      }),
    );
  }

  private constructor(private readonly findings: Finding[]) {}

  /** `path` may be `"*"`; `pattern` is a regular expression on the rule id. */
  findError(path: string, pattern: string): Finding[] {
    const regexp = new RegExp(pattern);
    return this.findings.filter(
      (finding) =>
        finding.severity === "error" &&
        (path === "*" || finding.path === path) &&
        regexp.test(finding.ruleName),
    );
  }

  hasError(path: string, pattern: string): void {
    expect(
      this.findError(path, pattern),
      `expected an error matching ${pattern} at ${path}; found ${JSON.stringify(this.findings)}`,
    ).not.toHaveLength(0);
  }

  hasNoError(path: string, pattern: string): void {
    expect(this.findError(path, pattern)).toHaveLength(0);
  }
}

/** cdk-nag v2 annotations read `<rule id>: <info>`. */
function toFindings(
  messages: ReturnType<Annotations["findError"]>,
  severity: string,
): Finding[] {
  return messages.map((message) => {
    const text = String(message.entry.data);
    return {
      path: message.id,
      ruleName: text.slice(0, text.indexOf(": ")),
      severity,
    };
  });
}

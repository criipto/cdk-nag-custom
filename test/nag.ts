import { expect } from "vitest";
import type { PolicyValidationPluginReport } from "aws-cdk-lib";
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
 * written with a leading slash.
 */
export class NagFindings {
  static of(scope: IConstruct, pack: NagPack): NagFindings {
    return new NagFindings(pack.validateScope(scope));
  }

  private readonly findings: Finding[];

  private constructor(report: PolicyValidationPluginReport) {
    this.findings = report.violations.flatMap((violation) =>
      violation.violatingResources.map((resource) => ({
        path: `/${resource.constructPath}`,
        ruleName: violation.ruleName,
        severity: violation.severity ?? "error",
      })),
    );
  }

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

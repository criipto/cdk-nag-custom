import { CfnResource } from "aws-cdk-lib";
import type { IConstruct } from "constructs";
import { NagPack, type NagPackProps } from "cdk-nag";

export class IduraChecks extends NagPack {
  constructor(props: NagPackProps = {}) {
    super(props);
    this.packName = "Idura";
  }

  override visit(node: IConstruct): void {
    if (!(node instanceof CfnResource)) return;
  }
}

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  deps: {
    neverBundle: ["aws-cdk-lib", "cdk-nag", "constructs"],
  },
});

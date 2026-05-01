# cdk-nag-custom

A collection of custom CDK nag rules used by Idura

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

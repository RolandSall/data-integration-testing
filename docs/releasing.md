# Publishing @integration-testing/data

The first release target is **0.1.0**, published with npm's **latest** tag. Preparing the version,
passing CI, and opening a release PR do not publish the package.

The GitHub owner is `RolandSall` and the npm organization scope is `@integration-testing`,
the same scope as the companion Testcontainers package.

## Verify the release candidate

From the checkout containing the final release changes, with Node 22.22+, Bun 1.3.5, and Docker:

```sh
bun install --frozen-lockfile
bun run verify
bun run pack:check:docker
bun run test:runners:minimum
bun run test:consumer
bun scripts/verify-release.ts
```

The gates check the package contents and optional dependency independence, ESM/CommonJS runtime
and declaration resolution, runner lifecycle behavior, real database rollback and failure paths,
and examples installed outside the workspace from the packed artifact. The consumer uses the
published `@integration-testing/testcontainers@0.1.0` package, not its source checkout.

Merge the release PR only after its CI passes, then require CI on the final `main` commit to pass.
Confirm `packages/data/package.json` contains version `0.1.0`. The version-availability check
accepts only a registry 404; an authentication or network error is not evidence of availability.

## First publication

The registry returned package-not-found during preparation on September 11, 2026. Recheck before
publishing. The package does not inherit authentication or trusted-publisher settings from
`@integration-testing/testcontainers`.

1. Use a clean checkout of the verified `main` commit and run the gates above.
2. Authenticate to npm with an account allowed to publish in `@integration-testing`. Check access
   with `npm whoami`; use `npm login` when needed. Never commit credentials or tokens.
3. Inspect the prepared archive with `npm pack ./packages/data --dry-run`. The package includes
   only `dist`, declarations, README, license, and package metadata. Examples are repository-only.
4. When ready to publish, run:

   ```sh
   npm publish ./.artifacts/integration-testing-data-0.1.0.tgz --access public --tag latest
   ```

   This publishes the archive produced by the package checks. The publication is permanent for
   this version, and npm may require account 2FA. Do not run this command merely to test access.
5. Check the registry rather than relying only on the command's exit status:

   ```sh
   npm view @integration-testing/data@0.1.0 version dist.integrity repository --json
   npm view @integration-testing/data dist-tags --json
   ```

6. In a clean directory outside this repository, install `@integration-testing/data@0.1.0` from
   npm and run the documented setup against a migrated test database. Confirm that `latest`
   resolves to `0.1.0` before announcing availability. A locally packed consumer does not prove
   registry installation.

## Configure trusted publishing for subsequent releases

After the package exists, add a GitHub Actions trusted publisher in its npm settings:

| Setting | Value |
| --- | --- |
| Organization or user | `RolandSall` |
| Repository | `data-integration-testing` |
| Workflow filename | `release.yml` |
| Environment | `npm` |
| Allowed action | Direct publish with `npm publish` |

The repository's `npm` GitHub environment exists. Its existence alone does not prove that the
npm trusted publisher has been configured. The workflow uses GitHub-hosted runners, Node 22.22.0,
npm 11.5.1, and `id-token: write`, matching the
[npm trusted-publishing requirements](https://docs.npmjs.com/trusted-publishers/).

Update the version and changelog, pass the release gates, and merge to `main`. Dispatch the
Release workflow on `main`, choosing `latest` for a normal release or `beta` for a prerelease.
The workflow defaults to `latest`, skips publishing jobs on other branches, rechecks the package
and database consumers, verifies version availability, and publishes with provenance via OIDC.
It needs no stored npm publishing token once the package's trusted publisher is configured.

Inspect the completed workflow and npm dist-tag before reporting a successful publication.

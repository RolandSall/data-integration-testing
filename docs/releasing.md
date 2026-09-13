# Publishing @integration-testing/data-isolation

The release target is **0.1.2**, published with npm's **latest** tag. Preparing the version,
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
Confirm `packages/data/package.json` contains version `0.1.2`. The version-availability check
accepts only a registry 404; an authentication or network error is not evidence of availability.

## Manual publication (fallback)

Prefer the Release workflow below once the package's trusted publisher is configured. Manual
publication requires an account with access to `@integration-testing/data-isolation`; access to
the companion Testcontainers package alone does not establish access to this package.

1. Use a clean checkout of the verified `main` commit and run the gates above.
2. Authenticate to npm with an account allowed to publish in `@integration-testing`. Check access
   with `npm whoami`; use `npm login` when needed. Never commit credentials or tokens.
3. Inspect the prepared archive with `npm pack ./packages/data --dry-run`. The package includes
   only `dist`, declarations, README, license, and package metadata. Examples are repository-only.
4. When ready to publish, run:

   ```sh
   npm publish ./.artifacts/integration-testing-data-isolation-0.1.2.tgz --access public --tag latest
   ```

   This publishes the archive produced by the package checks. The publication is permanent for
   this version, and npm may require account 2FA. Do not run this command merely to test access.
5. Check the registry rather than relying only on the command's exit status:

   ```sh
   npm view @integration-testing/data-isolation@0.1.2 version dist.integrity repository --json
   npm view @integration-testing/data-isolation dist-tags --json
   ```

6. Run the registry consumer check from the repository root:

   ```sh
   bun run test:consumer:published
   ```

   It copies the application outside the workspace, installs the manifest's exact package version
   from npm (without a local tarball or source alias), and runs the same database matrix. Confirm
   that `latest` resolves to `0.1.2` before announcing availability. A locally packed consumer
   does not prove registry installation.

## GitHub Actions publication

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
npm 11.19.1, and `id-token: write`, matching the
[npm trusted-publishing requirements](https://docs.npmjs.com/trusted-publishers/).

Update the version and changelog, pass the release gates, and merge to `main`. Dispatch the
Release workflow on `main`, choosing `latest` for a normal release or `beta` for a prerelease.
The workflow defaults to `latest`, skips publishing jobs on other branches, rechecks the package
and database consumers, verifies version availability, and publishes with provenance via OIDC.
It then runs `test:consumer:published` against the npm installation. Only after those steps succeed
does a separate job create the matching GitHub Release and version tag, such as `v0.1.2`, pointing
to the exact commit used by the workflow. Release notes are generated from GitHub history.
Stable releases use the Latest label; beta tags and prerelease versions are marked as prereleases.
Only the GitHub release job receives repository write permissions.

The workflow needs no stored npm publishing token once the package's trusted publisher is configured.
Inspect the completed workflow, npm dist-tag, and GitHub Release before reporting success.

### The GitHub Verified label

Like the companion Testcontainers release, a version tag can point to a GitHub-verified signed
commit. GitHub displays the verification status of that signature; a GitHub Release alone does
not sign the commit or the tag. Prefer a GitHub-signed merge commit as the release commit and
check its actual status:

```sh
gh api repos/RolandSall/data-integration-testing/commits/COMMIT_SHA --jq '.commit.verification | {verified, reason}'
```

The workflow does not create a signing key or claim that its generated tag is signed. npm provenance
is separate: it links the published package to the GitHub Actions workflow that built and published it.
See [GitHub signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).

### Completing a partially successful release

If npm publication succeeds but the consumer check or GitHub Release step fails, fix the failure
and verify the installed package before creating the release manually. Do not republish an existing
npm version. Use the exact successful publication commit, rather than a newer `main` commit:

```sh
gh release create v0.1.2 --repo RolandSall/data-integration-testing --target COMMIT_SHA --title 0.1.2 --generate-notes --latest
```

The automated job refuses an existing version tag rather than reusing it without inspection.
For manual recovery, check any existing tag points to the publication commit before using it.

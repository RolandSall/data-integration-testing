# Publishing @integration-testing/data

The GitHub repository uses the same owner as the Testcontainers repository (`RolandSall`).
The npm package uses the same organization scope, `@integration-testing`.

## First release

1. Run `bun run verify`, `bun run pack:check:docker`, `bun run test:runners:minimum`,
   and `bun run test:consumer` with Docker available. Both library and standalone consumer CI must pass.
   Recheck `npm view @integration-testing/data versions --json` before choosing the candidate version.
   The registry returned package-not-found on September 6, 2026, so the prepared first candidate is
   `0.1.0-beta.0`; this is not evidence of npm publication.
2. Authenticate to npm as a member with publish permission in `@integration-testing`.
3. From this repository, run `npm publish ./packages/data --access public --tag beta`.
   This creates `@integration-testing/data@0.1.0-beta.0`. npm may require account 2FA.
4. On the npm package's settings page, add a GitHub Actions trusted publisher:
   owner `RolandSall`, repository `data-integration-testing`, workflow `release.yml`,
   environment `npm`, and allow the publish action. Create that GitHub environment before running the workflow.
5. Verify `npm view @integration-testing/data@beta version repository --json`.
6. Replace the standalone demo's vendored archive dependency with the exact published version,
   regenerate its lockfile, and rerun its CI. Do not use a workspace link or TypeScript path alias.

The first publication needs an authenticated publisher; the new package cannot inherit
trusted-publisher settings from the existing Testcontainers package. Never commit npm tokens.

## Subsequent releases

Update the package version, run verification, commit and push to `main`, then dispatch the
Release workflow selecting `beta` or `latest`. The workflow verifies both real database examples
and the installed npm archive, checks version availability, and publishes with provenance via
GitHub OIDC. It does not need a stored npm token after trusted publishing has been configured.
Inspect the completed workflow and npm dist-tag before claiming a release is available.

The package archive is limited to compiled outputs, declarations, README, LICENSE, and metadata.
Core imports work without a database driver, test runner, or container package installed.
Do not copy Git refs or history from an extraction source into this repository.

Trusted publisher requirements: [npm documentation](https://docs.npmjs.com/trusted-publishers/).

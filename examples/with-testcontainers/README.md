# Data annotations with Testcontainers

This project uses `@integration-testing/data` and the published npm version
`@integration-testing/testcontainers@0.1.0-beta.0`. It uses `pg`, not Prisma.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run test:docker
```

Docker must be running. `@RequiredContainer(Container.PostgreSql)` is discovered by the
container package's global setup. `@DataIntegrationTest` creates a pg pool, then
leases a connection for each test transaction. Every fixture and test write is rolled back.
Global setup creates the shared schema once before both test files run. Per-file setup performs
no DDL, so parallel workers do not race to create the same table.
The container package stops the database after the run. No ports or credentials are hardcoded.

To copy this project outside the workspace after publication, replace `workspace:*` with
`0.1.0-beta.0` in its `@integration-testing/data` dependency, then run `bun install`
and `bun run test`. The TypeScript configuration is self-contained.

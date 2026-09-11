# Data annotations with Testcontainers

This project uses `@integration-testing/data-isolation` and the published npm version
`@integration-testing/testcontainers@0.1.0`. It uses `pg`, not Prisma.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run test:docker
```

Docker must be running. The named `@RequiredContainer` declaration with `isolation: 'shared'`
is discovered by the container package's global setup. Both files select the same `database`
resource with `getNamed('database', Container.PostgreSql)`. `@DataIntegrationTest` creates a pg pool, then
leases a connection for each test transaction. Every fixture and test write is rolled back.
Global setup applies `migrations/001-notes.sql` once before both test files run. Per-file setup performs
no DDL, so parallel workers do not race to create the same table.
Data setup restores the global resources through the exported `CONTAINER_RESOURCES_CONTEXT_KEY`
and `ContainerResources.fromSerializable`. In Testcontainers 0.1.0, `injectedContainerResources()`
requires its file lifecycle to have started, which is later than Data Integration initialization.
This example therefore uses manual global setup without the generated container file setup.

The container package stops the database after the run. No ports or credentials are hardcoded.

To copy this project outside the workspace after publication, replace `workspace:*` with
`0.1.1` in its `@integration-testing/data-isolation` dependency, then run `bun install`
and `bun run test`. The TypeScript configuration is self-contained.

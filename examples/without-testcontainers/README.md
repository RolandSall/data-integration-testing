# Data annotations without Testcontainers

This project uses `@integration-testing/data` with a real generated Prisma client and a
SQLite database in a fresh temporary directory. It has no Testcontainers dependency and
needs no Docker or database server.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run generate
bun run test:examples
```

`@DataIntegrationTest` prepares the schema. `PrismaTransactionAdapter` wraps the fixtures
and each test in an interactive transaction and rolls it back, including on assertion failure.
Teardown disconnects Prisma and removes only this suite's temporary directory.

For an existing database, change the Prisma datasource provider and supply its connection
URL in the setup configuration. Use your own migrations and omit database deletion when
your tests do not own the database. All repository operations must use the context client.

To copy this project outside the workspace after publication, replace `workspace:*` with
`0.1.0`, then run `bun install`, `bun run generate`, and `bun run test`.
The TypeScript configuration is self-contained.

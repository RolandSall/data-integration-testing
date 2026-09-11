# Transactional inventory integration tests

A small NestJS inventory application exercising `@integration-testing/data` from this repository. The same repositories, transaction configuration, and test scenarios run under
Jest 30 and Vitest 4.1. The example is excluded from the published npm package.

## Run

Node 22.22+, Bun 1.3.5, and Docker are required for the PostgreSQL container runs.
Run the following from the repository root; `build` prepares the library package exports.

```sh
bun install --frozen-lockfile
bun run build
bun run generate
bun run typecheck
bun run --cwd examples/nestjs-inventory test
```

The default command starts PostgreSQL with the published
[@integration-testing/testcontainers@0.1.0](https://www.npmjs.com/package/@integration-testing/testcontainers) package. Before creating test workers, it creates
one owned application schema and applies the application's real migrations once. Both parallel
PostgreSQL files use that migrated schema. Each test only inserts, updates, queries, and rolls back.
There is no DDL in test scenarios. SQLite is also migrated before workers and runs files serially
because SQLite permits only one writer.

For the following commands, first change to `examples/nestjs-inventory`:

```sh
# No Docker: Prisma/SQLite with both runners, including deliberate failure cases
bun run verify:sqlite

# An existing disposable PostgreSQL database; Testcontainers is not started
DATABASE_URL=postgresql://user:password@localhost:5432/test_database bun run test:external

# Verify the external URL path as well as the container path in one run
bun run test --exercise-external

# Additional ownership coverage: identical application migrations in a schema per file
bun run test:per-file
```

Only schemas and SQLite files created by the orchestration are deleted. The supplied PostgreSQL
database itself is never dropped. Use a test database account allowed to create/drop schemas.
A schema per file is additional verification, not the default migration strategy.

## Application and migrations

`src/inventory.ts` contains the inventory service and repository port. Products have unique SKUs
and nonnegative stock. Reservations have unique references, a product foreign key, and positive
quantities. Reserving inventory decrements stock and inserts a reservation using the supplied
client. The adapters in `src` implement these operations with Prisma, pg, and TypeORM.

`migrations/001-inventory.sql` is the application's schema authority. `src/migrate.ts` is the
migration entrypoint, with a migration history table; the test launcher invokes it before workers.
It is also usable during application deployment:

```sh
DATABASE_URL=postgresql://user:password@localhost:5432/inventory bun run migrate
```

Prisma schemas provide client generation. TypeORM has `synchronize: false`. Tests do not substitute
handcrafted tables or ask either ORM to invent a different persistence model.

This is a repository-focused application slice. `test/application.ts` constructs a NestJS testing
module and explicitly overrides the database provider with the current transaction client. The
application source does not import the testing library. A real application must also define its
production transaction boundary; this demo does not install an HTTP server or automatically make
HTTP requests transactional.

## Consistent test API

Both runner setup files install the context exported from `test/context.ts`. One test file uses
`@DataIntegrationTest`, the other uses `declareDataIntegrationTest()`. Both call `test/scenarios.ts`.
`beforeEach`, the test, and `afterEach` use the same client. TypeORM repositories come from the
transaction's `EntityManager`, never from `DataSource.manager`.

| Runner | PostgreSQL clients | SQLite |
| --- | --- | --- |
| Jest 30 | pg 8, Prisma 6.19.3, TypeORM 0.3 | Prisma 6.19.3 |
| Vitest 4.1 | pg 8, Prisma 6.19.3, TypeORM 0.3 | Prisma 6.19.3 |

The default matrix runs 12 application tests per combination, plus handwritten pg tests under
both runners. Separate deliberately failing runner processes exercise assertion, fixture,
teardown, timeout, and PostgreSQL connection-termination failures. Their exit code must be
nonzero and an independent root connection must verify that application rows did not commit.
Logs are saved under `.artifacts`.

Shared fixture keys can briefly serialize transactions on PostgreSQL locks. Use distinct keys
when that contention is irrelevant to the behavior under test. Rollback does not prevent all
concurrency effects. Tests within a file are sequential; `.concurrent` is unsupported.

## Compare with ordinary hooks

`test/baseline.test.ts` uses handwritten pg hooks and exactly the same inventory scenarios under
both runners. Its runner configuration does not load the library environment or installer.

| Concern | Handwritten baseline | Data library |
| --- | --- | --- |
| Application migrations | Global application setup | Same global application setup |
| pg transaction | Explicit BEGIN/ROLLBACK and connection release hooks | PgTransactionAdapter |
| Fixture ordering | Nested suite arranges hooks inside transaction hooks | Runner integration surrounds per-test hooks |
| Prisma/TypeORM | Write client-specific lifecycle code | Select the corresponding adapter |
| Context and declaration | Explicit transaction variable | Typed context and one file declaration |
| Cleanup fault handling | Application owns this behavior | Shared lifecycle and runner error reporting |

Ordinary hooks are sufficient for a small pg-only suite. This library's value is consistent client
access, lifecycle behavior, and tested failure reporting across the supported runners and clients.
No runtime speed or maintenance savings have been measured. Migration and application wiring
remain your responsibility.

Rollback guarantees apply only to awaited work using the supplied transaction client. Unrelated
connections, HTTP requests, background workers, explicit commits, and nontransactional operations
are not captured. Runner timeouts cannot forcibly cancel arbitrary JavaScript; the failure matrix
verifies cleanup but does not claim cancellation of user work.

## Installed-package verification and npm contents

The local example uses the workspace package's compiled exports during development. To prove
consumer behavior independently of workspace resolution, run from the repository root:

```sh
bun run test:consumer          # PostgreSQL, SQLite, external URL, and separate-schema coverage
bun run test:consumer:sqlite   # Installed-package check without Docker
```

The verifier packs `packages/data`, copies this example to a temporary directory outside the
workspace, replaces the workspace dependency with that exact archive, installs dependencies,
generates Prisma clients, typechecks, and runs the matrix. No separate GitHub repository, copied
library source, vendored release candidate, or npm publication is needed.

Only `packages/data` is published. Its `files` allowlist contains `dist`, `README.md`, and `LICENSE`
(along with npm's package metadata), so this example's NestJS code, migrations, tests, and dependencies
are absent from the npm archive. `bun run pack:check` enforces the archive boundary.

MIT license.

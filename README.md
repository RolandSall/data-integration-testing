# @integration-testing/data

Write isolated database integration tests with a consistent API across supported test runners and database clients.

Configure your database once, install the matching runner integration, and opt in with
`@DataIntegrationTest` or `declareDataIntegrationTest()`. Each test and its per-test hooks use
one transaction that rolls back. Infrastructure is supplied by your application: Testcontainers,
Docker Compose, an existing disposable database, or local SQLite.

## Compatibility

| Runner | PostgreSQL | SQLite |
| --- | --- | --- |
| Jest 30, Node environment | pg 8, Prisma 6.19, TypeORM 0.3 | Prisma 6.19 |
| Vitest 4.1 | pg 8, Prisma 6.19, TypeORM 0.3 | Prisma 6.19 |

Node.js 22.22+ is required. CI covers real database operations and independent installed consumers.
SQL Server URL construction is retained under `/prisma/sql-server`; SQL Server transactions,
other engines, newer client majors, and other runners are not in the verified matrix.

The core has no runtime dependency on an ORM, runner, or Testcontainers. Choose only the
entrypoints and optional peers you use. Core, database adapters, and Jest support provide
ESM and CommonJS exports. Vitest support is ESM.

## Configure once

```sh
npm install --save-dev @integration-testing/data@beta
# Select a runner:
npm install --save-dev vitest@~4.1.11
# Or:
npm install --save-dev jest@^30.1 jest-environment-node@^30.1
# Select an application database client, for example:
npm install pg
```

Until the first npm publication, use the prepared archive or the demo's vendored release candidate.

```ts
// test/data-context.ts: shared by either runner
import { Pool } from 'pg';
import { createDataIntegrationTestContext } from '@integration-testing/data';
import { PgTransactionAdapter } from '@integration-testing/data/pg';

export const dataContext = createDataIntegrationTestContext({
  getResources: () => process.env.TEST_DATABASE_URL!,
  createDatabase: async (url) => url,
  createClient: async (url) => new Pool({ connectionString: url }),
  // This example selects an existing, migrated, disposable test database.
  closeClient: async (pool) => { await pool.end(); },
  dropDatabase: async () => {},
  transactions: new PgTransactionAdapter(),
});
```

For parallel files, run the application's real migrations once globally before workers.
An explicitly isolated database must use those same migrations. Never run competing shared DDL from
per-file `prepareDatabase`, even with `IF NOT EXISTS`. Only
remove resources that configuration owns. The [standalone NestJS demo](https://github.com/RolandSall/data-integration-testing-demo)
shows complete migration, ownership, and dependency-injection setup for all three clients.

```ts
// test/jest.setup.ts, listed in Jest setupFilesAfterEnv
import { installJestDataIntegrationTestSupport } from '@integration-testing/data/jest';
import { dataContext } from './data-context.js';
installJestDataIntegrationTestSupport(dataContext);
```

```js
// jest.config.cjs (add your normal TypeScript transform when testing .ts files)
module.exports = {
  testEnvironment: '@integration-testing/data/jest/environment',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
};
```

```ts
// test/vitest.setup.ts, listed in Vitest setupFiles
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data/vitest';
import { dataContext } from './data-context.js';
installVitestDataIntegrationTestSupport(dataContext);
```

```ts
// Shared test shape; use your runner's test/expect imports or configured globals.
import { DataIntegrationTest } from '@integration-testing/data';
import { dataContext } from './data-context.js';

@DataIntegrationTest
export class NotesIntegrationTest {}

// Decorator-free alternative, instead of the class above:
// import { declareDataIntegrationTest } from '@integration-testing/data';
// declareDataIntegrationTest();

test('saves a note', async () => {
  const { client } = dataContext.getCurrentContext();
  await client.query('INSERT INTO notes (id, body) VALUES ($1, $2)', ['one', 'hello']);
  const result = await client.query('SELECT body FROM notes WHERE id = $1', ['one']);
  expect(result.rows).toEqual([{ body: 'hello' }]);
});
```

The declaration applies to the whole file, including nested suites. One declaration is allowed
per activated file. Undeclared files do not create database resources. Install once per test-file
sandbox, with normal runner isolation enabled; keep runtime context modules out of resetModules
calls. Existing Vitest configuration-based installer calls remain supported.

## Transaction and lifecycle contract

- Per-file resource setup runs before suite hooks; cleanup runs after them. Shared migrations
  run separately during global setup, before workers start.
- `beforeEach`, test body, and `afterEach` share one scoped client. Each retry opens a new transaction.
- `beforeAll` and `afterAll` are outside per-test transactions. Context access there or after completion fails.
- Synchronous and promise-returning tests/hooks, nested suites, parameterized tests, filtering,
  skips, and expected failures retain runner behavior. Callback-style `done` is unsupported.
- Activated files reject concurrent tests. Parallel files require globally prepared shared schema or separately owned state.
- `transactionLifecycleTimeoutMs`, passed as the installer's second-argument option, defaults
  to 10000 and bounds transaction acquisition and rollback, independently of test duration.
- Original failures remain visible; additional rollback/release failures are retained. Expected
  failures cannot hide infrastructure failures. Teardown is idempotent.

Jest uses the package's Node environment and supported Circus events, with no global test-function
replacement or private Circus imports. Vitest uses `aroundAll` and `aroundEach` so suite cleanup
runs after user hooks regardless of hook ordering. Custom Jest environments and runner isolation
disabled are outside the current compatibility contract.

## Parallel files and shared schema

Transaction isolation and schema initialization are separate concerns. `prepareDatabase` runs
once per activated file; it is not a global migration coordinator. With a shared database, run
migrations in the runner's native global setup, or in an orchestration step before launching
workers, then omit per-file schema preparation. Do not drop shared schema from a file's teardown.

The container example uses `prepareResources` in Testcontainers global setup and runs two files
against the same migrated table. The standalone demo migrates one shared schema before either
runner starts by default. Its optional `--per-file` verification uses identical application migrations
in separately owned schemas; tests never invent their own tables. Use distinct fixture keys
across files to avoid unnecessary lock contention; rollback does not remove all concurrency effects.

For Jest, global setup is a separate execution context: transfer only serializable connection
facts through environment variables or a resource descriptor. Do not transfer clients or transaction
handles to workers. Testcontainers' published Jest resource mechanism can supply these facts too.

## Wire the transaction into your application

The context client must be supplied to the actual repository under test. In NestJS, construct a
narrow `TestingModule` and override the database provider with that client's value. With TypeORM,
use the scoped `EntityManager.getRepository`, not a root `DataSource` repository. The demo contains
real examples; no application source imports this testing package and no production client is patched.

Other adapters implement the existing `TransactionAdapter<RootClient, TransactionClient>` contract.
`/prisma` exports `PrismaTransactionAdapter`; `/pg` exports `PgTransactionAdapter`; `/typeorm`
exports `TypeOrmTransactionAdapter`. Existing lifecycle manager methods remain available to
integrators, but manually wiring another runner does not make it a verified integration.

Rollback covers awaited operations using that scoped client. Separate connections, HTTP calls,
background workers, explicit commits, nontransactional DDL, and external services are outside
this guarantee. Runner timeouts cannot cancel arbitrary JavaScript; never retain a client or
launch unawaited work beyond the test. Close/invalidate the context and report cleanup errors,
but do not infer that a timed-out promise has stopped running. Configure driver connection/query
timeouts for your environment as well.

## Verification and examples

```sh
bun install --frozen-lockfile
bun run verify             # audit, build, typecheck, lint, unit and child-process runner checks, package checks
bun run pack:check:docker  # original installed PostgreSQL and SQLite examples
bun run test:consumer      # pinned standalone NestJS consumer using the current packed artifact
```

The [standalone demo](https://github.com/RolandSall/data-integration-testing-demo) compares the
same inventory application and scenarios with handwritten pg fixtures and this library, under
both runners. Its CI runs without a library checkout. It also checks deliberately failing
processes, real connection termination, timeouts, rollback through independent connections,
and parallel files. This demonstrates behavior and wiring; no performance advantage is claimed.

The original [container example](examples/with-testcontainers) and
[SQLite example](examples/without-testcontainers) remain smaller starting points.
See [release instructions](docs/releasing.md) for first publication and trusted publishing.

MIT license.

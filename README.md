# @integration-testing/data

Database integration-test annotations with a transaction that rolls back after each test.
The core works with any transaction-capable database client through `TransactionAdapter`.
Prisma and node-postgres adapters are included as optional subpath imports.

This is an independent repository and npm package in the `@integration-testing` scope.
The companion [Testcontainers package](https://www.npmjs.com/package/@integration-testing/testcontainers)
is optional infrastructure, consumed from npm only by the container example.

## Install

```sh
npm install --save-dev @integration-testing/data@beta vitest@^4.1.0
# Choose the client your application uses:
npm install pg
# Or install and generate your application's Prisma client.
```

The initial package release must be published before the npm install command is available.
Requires Node.js 22.22+ and Vitest >=4.1 <5 for automatic annotations. The lifecycle manager
has no test runner dependency. Core, Prisma, and PostgreSQL exports support ESM and CommonJS;
the Vitest adapter is ESM.

## Two complete example projects

| Project | Database client | Infrastructure | What it proves |
| --- | --- | --- | --- |
| [with-testcontainers](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers) | node-postgres | Published `@integration-testing/testcontainers@0.1.0-beta.0` | Both annotations compose; PostgreSQL writes roll back |
| [without-testcontainers](https://github.com/RolandSall/data-integration-testing/tree/main/examples/without-testcontainers) | Prisma | Temporary local SQLite file | Data annotations work without Testcontainers or Docker |

Both run actual database queries. A repeated primary key in each test's fixture proves
that `beforeEach` participates in rollback. Teardown also checks the database through
the root client and fails if any test writes committed. Examples have separate manifests,
configurations, setup modules, and tests; neither imports the other example.

```sh
bun install --frozen-lockfile
bun run verify            # build, generate Prisma, typecheck, lint, unit tests, SQLite, package smoke tests
bun run test:docker       # PostgreSQL via the published npm container package; requires Docker
bun run pack:check:docker # isolated installed-tarball consumers, including both example projects
```

## Annotation flow

Register `installVitestDataIntegrationTestSupport(configuration)` once in Vitest's
`setupFiles`, then export its returned context accessor. Mark one class in each data test file:

```ts
import { DataIntegrationTest } from '@integration-testing/data';
import { expect, test } from 'vitest';
import { dataContext } from './data.setup.js';

@DataIntegrationTest
export class NotesDataIntegrationTest {}

test('reads a saved note', async () => {
  const { client } = dataContext.getCurrentContext();
  await client.query('INSERT INTO notes (id, body) VALUES ($1, $2)', ['one', 'hello']);
  const result = await client.query('SELECT body FROM notes WHERE id = $1', ['one']);
  expect(result.rows).toEqual([{ body: 'hello' }]);
});
```

The marker applies to the whole file, including nested suites. Undecorated files do not
create a database. Multiple decorated classes in one file are rejected. `aroundEach`
wraps `beforeEach`, the test body, and `afterEach` in one transaction. `beforeAll` and
`afterAll` are outside that transaction. The accessor uses `AsyncLocalStorage` so asynchronous
operations receive their current test's client.

## Configure your database

The configuration supplies existing infrastructure, database creation or selection, client
creation, optional schema preparation, client closure, database cleanup, and a transaction adapter.
See the two runnable setup modules for full typed configurations.

```ts
import { PgTransactionAdapter } from '@integration-testing/data/pg';
import { PrismaTransactionAdapter } from '@integration-testing/data/prisma';

const postgresTransactions = new PgTransactionAdapter();
// Use your application's generated Prisma types:
const prismaTransactions = new PrismaTransactionAdapter<PrismaClient, Prisma.TransactionClient>();
```

The existing `prismaSqlServerUrlFor` connection URL helper is retained under
`@integration-testing/data/prisma/sql-server`. It accepts connection facts from any provider.

Neither adapter creates infrastructure. For an existing database, return its connection details
from `getResources` and `createDatabase`; make `dropDatabase` a no-op unless your configuration
created state it owns. Schema preparation can invoke your migration tool.

For another client, implement the existing `TransactionAdapter<RootClient, TransactionClient>`
contract. Its `rollbackOnly(client, work)` method must acquire a transaction, call and await
`work(transactionClient)`, roll back on success and failure, release owned resources, and
rethrow test failures. This can adapt TypeORM, Knex, Sequelize, SQL Server clients, or another
transaction API; these clients do not yet have bundled, tested adapters. Nontransactional
engines require a different isolation strategy and are not covered by rollback-only semantics.

With another runner, use `DataIntegrationTestContextManager` directly: await `beforeTestClass`,
wrap each test and its per-test fixtures in `executeTestMethod`, and await `afterTestClass` in
cleanup. Automatic annotation support is currently Vitest-only.

## Transaction boundaries

All operations under test must use the transaction-scoped client, including repositories.
Separate root-client writes, HTTP requests opening other connections, explicit commits,
autonomous transactions, external services, and some database DDL are outside this guarantee.
Await database work before returning from a test. Concurrent PostgreSQL tests lease separate
connections; SQLite writes may lock, so the SQLite example uses sequential tests.

## Package and release

One public package exposes `.`, `/vitest`, `/prisma`, `/prisma/sql-server`, and `/pg`; examples are private workspaces.
There is no runtime dependency on Testcontainers, Prisma, pg, or Vitest in the core. Vitest and
pg are optional peers for their respective adapters; Prisma uses a structural client contract.
The npm archive includes only built code, declarations, README, LICENSE, and package metadata.
Source maps and private repository history are excluded.

See [release instructions](https://github.com/RolandSall/data-integration-testing/blob/main/docs/releasing.md) for npm organization setup and trusted publishing.

MIT license.

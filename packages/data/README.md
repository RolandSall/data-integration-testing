# @integration-testing/data-isolation

**Write isolated database integration tests with a consistent API across supported test runners and database clients.**

Your repository test inserts a product, updates its stock, and checks the result. The test passes.
But the product is still in the database. Run the test again and the same SKU may already exist;
run another test and it may see data left behind by the first.

Now every test needs a cleanup strategy: delete the rows it created, handle foreign keys in the
right order, and make sure cleanup still runs when an assertion fails.

**Give each test a transaction, then roll back its writes automatically.**

That is what this library provides through rollback-only transactions. After your application's
real migrations have prepared the database, each test gets its own transaction. Its fixtures,
test body, and teardown use the same transaction-scoped client. When the attempt finishes, the
library rolls back those writes, whether the test passed or failed. You do not write per-test
`DELETE` cleanup for operations made through that client.

Configure your database and test runner once. Then declare each transactional test file and use
the shared context:

```ts
import { declareDataIntegrationTest } from '@integration-testing/data-isolation';
import { dataContext } from './data-context.js';

declareDataIntegrationTest();

test('creates a product', async () => {
  const client = dataContext.getCurrentContext().client;
  await client.query('INSERT INTO products (sku, stock) VALUES ($1, $2)', ['book', 10]);
  const result = await client.query('SELECT stock FROM products WHERE sku = $1', ['book']);
  expect(result.rows[0].stock).toBe(10);
}); // The insert is rolled back, including when the assertion fails.
```

This example uses pg and your runner's globals after one-time setup. Prefer annotations?
`@DataIntegrationTest` on one marker class has the same effect as `declareDataIntegrationTest()`.
Use exactly one declaration per test file. Both forms require the runner setup linked below.

## Two tools that work hand in hand

**Real infrastructure with [@integration-testing/testcontainers](https://www.npmjs.com/package/@integration-testing/testcontainers),
isolated test data with @integration-testing/data-isolation.**

| Tool | Responsibility |
| --- | --- |
| [Testcontainers Integration](https://github.com/RolandSall/testcontainers-integration) | Start disposable infrastructure and stop it after the run |
| Data Isolation | Give each test a transaction-scoped client and roll back its writes |
| Your application | Apply its real migrations before test workers start and pass the scoped client to repositories |

Start with the [paired PostgreSQL example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers),
which uses the published `@integration-testing/testcontainers@0.1.0` package. Both tools remain
independent: an existing test database, Docker Compose, or a CI database service can also supply
the connection URL.

## Install and configure once

For the **0.1.1 release**, install:

```sh
npm install --save-dev @integration-testing/data-isolation@0.1.1
```

The lifecycle is database-independent: configure a transaction adapter for your database client.

Requires Node.js 22.22+. Supports Vitest 4.1.x, Jest 30.x, pg 8.x, and TypeORM 0.3.x.
Install only the runner and database client you use; runner and driver dependencies stay optional.
Core, database adapters, and Jest integration support ESM and CommonJS; the Vitest integration
uses ESM. Before npm publication, use the
[local archive instructions](https://github.com/RolandSall/data-integration-testing/blob/main/docs/usage.md#installation).

1. Export a shared context with `createDataIntegrationTestContext(configuration)`.
2. Install that context in your runner setup. Jest also requires the package's `/jest/environment`.
3. Run your application's real migrations before workers start.
4. Declare each transactional test file and use `dataContext.getCurrentContext().client`.

The [setup guide](https://github.com/RolandSall/data-integration-testing/blob/main/docs/usage.md#quick-start-with-pg-and-vitest)
provides complete files and commands. Choose your runnable example below to see the wiring in context.

## Examples

These projects live in this repository and **are not shipped to npm**. Each example README
explains its prerequisites and commands; the links to setup files show the actual implementation.

| What you want to do | Runnable example and setup |
| --- | --- |
| Start PostgreSQL with Testcontainers and use pg + Vitest | [Small paired example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers), [database context](https://github.com/RolandSall/data-integration-testing/blob/main/examples/with-testcontainers/test/data.setup.ts) |
| Use pg, Prisma, or TypeORM with Jest and Vitest | [NestJS inventory application](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory), [shared context](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/context.ts) |
| Configure Jest | [Jest configuration](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/jest.config.cjs), [setup](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/jest.setup.ts) |
| Configure Vitest | [Vitest configuration](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/vitest.config.ts), [setup](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/vitest.setup.ts) |
| Use an existing PostgreSQL URL without Testcontainers | [Inventory run instructions: `test:external`](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory#run) |
| Try Prisma + SQLite without Docker | [Small SQLite example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/without-testcontainers), [inventory SQLite mode](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory#run) |
| Inject a transaction-bound client into NestJS repositories | [Provider overrides](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/application.ts), [repository implementations](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory/src) |
| Apply real application migrations once | [Inventory migrations and launcher](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory#application-and-migrations) |
| Compare with handwritten transaction hooks | [Comparison](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory#compare-with-ordinary-hooks), [pg baseline for both runners](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/baseline.test.ts) |

The inventory example exercises the same application behavior across clients and runners,
including constraints, multi-write operations, and rollback verified from an independent connection.
Its installed-package check copies the project outside the workspace and installs a packed archive.
See [consumer verification](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory#installed-package-verification-and-npm-contents).

## What it does and does not do

Use this library for direct database and repository tests whose operations can use the supplied
transaction client.

| The library handles | Your application supplies |
| --- | --- |
| A new transaction for each test attempt, including retries | A reachable test database and real application migrations |
| One typed client across `beforeEach`, the test, and `afterEach` | Awaited operations using that client |
| Rollback after passing and failing tests, with cleanup failures reported | Repository or NestJS provider wiring |
| Jest and Vitest lifecycle integration | A shared context and the runner setup |

Rollback covers **awaited operations using the supplied transaction client**. The library does
not patch production clients or automatically capture other connections, HTTP requests,
background jobs, explicit commits, or nontransactional database operations. It does not undo
messages, files, or other external effects.

Run real migrations once before workers for a shared database. `prepareDatabase` is per file,
so it is not the place for shared schema preparation. `beforeAll` and `afterAll` are outside
per-test transactions. Tests within a file must run sequentially; `.concurrent` and callback-style
`done` tests/hooks are unsupported. Parallel files still need fixtures that account for database
locks and shared state. Runner timeouts cannot forcibly cancel arbitrary JavaScript.

The core can be integrated with other runners, but Cucumber and custom harnesses need their own
runner adapter. A declaration alone does not supply that integration.

Ordinary rollback hooks can be enough for a small suite. This library provides a reusable typed
context and consistent lifecycle and failure reporting across supported runners and clients.
No performance or maintenance savings are claimed without measurement.

For details, see the [rollback boundaries](https://github.com/RolandSall/data-integration-testing/blob/main/docs/usage.md#rollback-boundaries),
[API and troubleshooting](https://github.com/RolandSall/data-integration-testing/blob/main/docs/usage.md#lifecycle-contract-and-troubleshooting),
and [Testcontainers resource handoff](https://github.com/RolandSall/data-integration-testing/blob/main/docs/usage.md#testcontainers-resource-handoff).

## Contributing and release checks

```sh
bun install --frozen-lockfile
bun run verify                 # Build, types, lint, runner tests, SQLite, package checks
bun run test:consumer           # Installed consumer matrix; PostgreSQL requires Docker
```

See the [release guide](https://github.com/RolandSall/data-integration-testing/blob/main/docs/releasing.md)
for the complete release gates and publication steps.

MIT license.

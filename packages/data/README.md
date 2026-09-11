# @integration-testing/data

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
import { declareDataIntegrationTest } from '@integration-testing/data';
import { dataContext } from './data-context.js';

declareDataIntegrationTest();

test('creates a product', async () => {
  const client = dataContext.getCurrentContext().client;
  await client.query('INSERT INTO products (sku, stock) VALUES ($1, $2)', ['book', 10]);
  const result = await client.query('SELECT stock FROM products WHERE sku = $1', ['book']);
  expect(result.rows[0].stock).toBe(10);
}); // The insert is rolled back, including when the assertion fails.
```

This is the test-file API after setup, using pg and runner globals. The quick start below supplies
the context and runner configuration. Prefer annotations? `@DataIntegrationTest` on one marker
class has the same effect as `declareDataIntegrationTest()`; use one form per file.

## Recommended pairing: Testcontainers Integration + Data Integration

**Real infrastructure, isolated test data: two tools that work hand in hand.**

Use **[@integration-testing/testcontainers](https://www.npmjs.com/package/@integration-testing/testcontainers)**
to start a disposable PostgreSQL instance and provide its connection URL. Apply your application's
real migrations once, then use **@integration-testing/data** to roll back each test's writes.
Testcontainers Integration stops the infrastructure after the run; Data Integration manages the
test transactions and its configured clients.

The [Testcontainers Integration repository](https://github.com/RolandSall/testcontainers-integration)
documents its infrastructure APIs. The [complete paired setup](#complete-setup-testcontainers-with-pg-and-either-runner)
below adds Docker provisioning to the same context and tests used in the quick start. Both libraries
remain independent: an existing database, Docker Compose, or a CI database service also works.

## Start here

1. [Install the package and your runner](#compatibility-and-installation).
2. [Follow the quick start](#quick-start-with-pg-and-vitest): configure once, declare a test file, and run it.
3. [Use Jest](#configure-jest-once) if that is your runner; keep the same context and tests.
4. [Add Testcontainers Integration](#complete-setup-testcontainers-with-pg-and-either-runner) for a disposable database.

For another client, replace the pg context with [Prisma](#use-prisma-instead-of-pg) or
[TypeORM](#use-typeorm-instead-of-pg). For no Docker, use [Prisma/SQLite](#alternative-prisma-with-sqlite-without-docker).

Further reading: [NestJS provider wiring](#inject-the-transaction-into-nestjs-repositories),
[native runner global setup](#alternative-native-testcontainers-global-setup),
[Testcontainers compatibility](#compatibility-between-the-two-packages),
[migrations and parallel files](#migrations-parallel-files-and-resource-ownership),
[what it does and does not do](#what-it-does-and-does-not-do),
[rollback boundaries](#rollback-boundaries), [API and troubleshooting](#lifecycle-contract-and-troubleshooting),
[other runners](#runner-neutral-core-and-other-runners), and [runnable examples](#examples-comparison-and-verification).

## Compatibility and installation

| Database | Supported database clients | Supported test runners |
| --- | --- | --- |
| PostgreSQL | pg 8, Prisma 6.19, TypeORM 0.3 | Jest 30.1+ (below 31), Vitest 4.1 |
| SQLite (optional, without Docker) | Prisma 6.19 | Jest 30.1+ (below 31), Vitest 4.1 |

Jest requires this package's Node test environment, as shown in the Jest setup below.

**SQLite is an optional database; Prisma is the client used to access it.** The optional SQLite
example uses Prisma to connect to a local database file, so it can demonstrate transactional
tests without a database server or Docker. The main walkthrough uses PostgreSQL. If your
application runs on PostgreSQL, use PostgreSQL for tests that must verify its database behavior;
the SQLite example is not a replacement for that coverage.

Use Node.js 22.22 or newer. The real-database matrix covers both runners and all combinations
above. Other engines, newer client majors, and other runners are outside that verified matrix.
SQL Server URL construction remains available through `/prisma/sql-server`; that helper does
not establish SQL Server transaction support.

**Publication status:** Data Integration's first candidate is `0.1.0-beta.0`; it is not yet
published to npm. To use it in another application now, build and pack this repository:

```sh
# From a checkout of this repository (Bun 1.3.5):
bun install --frozen-lockfile
bun run build
npm pack ./packages/data --pack-destination .
```

Copy the resulting archive to your application's `vendor` directory and install it:

```sh
npm install --save-dev ./vendor/integration-testing-data-0.1.0-beta.0.tgz
```

After publication, the installation will be `npm install --save-dev @integration-testing/data@beta`.
For the pg quick start, install the driver and TypeScript tooling:

```sh
npm install pg@8
npm install --save-dev typescript@5.9.3 @types/node@22 @types/pg@8
```

Install the runner you use. The quick start uses Vitest; the Jest section provides the alternative:

```sh
# Vitest
npm install --save-dev vitest@~4.1.11

# Jest
npm install --save-dev jest@~30.4.2 jest-environment-node@~30.4.1 ts-jest@^29.4.1 @types/jest@30
```

Runner and driver dependencies are optional peers, confined to their corresponding entrypoints.
Core, database adapters, and Jest integration support ESM and CommonJS. Vitest integration is ESM.

## Quick start with pg and Vitest

This path assumes you have a **test PostgreSQL database** and an application migration command
named `migrate` that reads `DATABASE_URL`. The example queries the inventory application's
`products` table with `sku` and `stock` columns; use your real tables and migrations in your app.
To get a database through Docker instead, finish the context, runner, and test setup here, then
use the [Testcontainers launcher](#complete-setup-testcontainers-with-pg-and-either-runner) for the run step.

Set `"type": "module"` in your application's `package.json`. The files below belong in your
application, and commands run from its root. If your runner and TypeScript configuration already
exist, merge the relevant options into them.

### 1. Configure the database once

```ts
// test/data-context.ts
import { Pool } from 'pg';
import { createDataIntegrationTestContext } from '@integration-testing/data';
import { PgTransactionAdapter } from '@integration-testing/data/pg';

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must identify a migrated test database');
  return url;
}

export const dataContext = createDataIntegrationTestContext({
  getResources: databaseUrl,
  createDatabase: async (url) => url, // Select the already migrated database.
  createClient: async (url) => new Pool({ connectionString: url }),
  closeClient: async (pool) => { await pool.end(); },
  dropDatabase: async () => {}, // This configuration selects a database; it does not own or drop it.
  transactions: new PgTransactionAdapter(),
});
```

This context selects a database URL and manages a pool for each activated file.
`createDatabase` does not create a database in this example, and `dropDatabase` deliberately
does nothing because the configuration does not own the database. Run migrations before workers
start, as shown in step 4; no `prepareDatabase` callback is needed. The context has no runner imports.
Export it once and import that same instance from your test files.

<a id="configure-vitest-once"></a>

### 2. Connect Vitest once

```ts
// test/vitest.setup.ts
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data/vitest';
import { dataContext } from './data-context.js';

installVitestDataIntegrationTestSupport(dataContext);
```

```ts
// vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.integration.test.ts'],
    setupFiles: ['./test/vitest.setup.ts'],
    maxWorkers: 2,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
```

<details>
<summary>TypeScript setup for a new project (tsconfig.json)</summary>

Use this root configuration for the examples, including the optional decorator form:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "strict": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.integration.config.ts"]
}
```

</details>

The setup file installs the lifecycle hooks once per test-file environment. The installer checks
for a data declaration after collection; files without one remain inactive. Keep default file
isolation enabled and run tests sequentially within each file.

The existing `installVitestDataIntegrationTestSupport(configuration)` signature is also supported
and returns a context manager. The factory-based form above makes the context reusable across runners.

<a id="write-the-same-transactional-tests"></a>

### 3. Declare a file and write tests

Use ordinary runner tests and hooks. With the runner globals configured above, this file also
runs unchanged under Jest:

```ts
// test/products.integration.test.ts
import { declareDataIntegrationTest } from '@integration-testing/data';
import { dataContext } from './data-context.js';

declareDataIntegrationTest();

beforeEach(async () => {
  await dataContext.getCurrentContext().client.query(
    'INSERT INTO products (sku, stock) VALUES ($1, $2)',
    ['book', 10],
  );
});

test('decrements stock in the current transaction', async () => {
  const client = dataContext.getCurrentContext().client;
  await client.query('UPDATE products SET stock = stock - 3 WHERE sku = $1', ['book']);
  const result = await client.query<{ stock: number }>(
    'SELECT stock FROM products WHERE sku = $1', ['book'],
  );
  expect(result.rows[0]?.stock).toBe(7);
});

test('starts with a fresh fixture after the previous test', async () => {
  const result = await dataContext.getCurrentContext().client.query<{ stock: number }>(
    'SELECT stock FROM products WHERE sku = $1', ['book'],
  );
  expect(result.rows[0]?.stock).toBe(10);
});

afterEach(() => {
  // The transaction context is still accessible in teardown.
  expect(dataContext.getCurrentContext().client).toBeDefined();
});
```

The file marker activates the whole file, including nested `describe` suites. It does not create
a test-class instance or register test methods. Continue using your runner's ordinary test API.
`beforeEach`, test bodies, and `afterEach` share one transaction per attempt; `beforeAll` and
`afterAll` run outside those transactions.

If you prefer annotations, replace the `declareDataIntegrationTest` import and call with:

```ts
import { DataIntegrationTest } from '@integration-testing/data';

@DataIntegrationTest
export class ProductRepositoryTest {}
```

Use exactly one declaration per activated file. Do not use both forms in the same file. Unmarked
files do not activate database resources. The declaration must execute during test-file collection,
before tests run. Tests inside activated files run sequentially; do not use `.concurrent`.

### 4. Migrate and run

```sh
export DATABASE_URL='postgresql://test_user:test_password@localhost:5432/inventory_test'
npm run migrate
npx vitest run --config vitest.integration.config.ts
```

Both tests should pass: the first sees stock `7`; the second starts from its own fixture with
stock `10`. Their inserted product is rolled back. No `BEGIN`, `ROLLBACK`, or per-test delete
hooks are needed in this test file. Existing committed rows remain unchanged by rollback.
Choose fixture keys that do not conflict with pre-existing data or other parallel tests.

**For the next test file:** import the same context, add one declaration, and write tests using
`dataContext.getCurrentContext().client`. The database configuration and installer are reused.
Read the client inside a test or its per-test hooks; do not capture it at module scope.

### What happens when a file runs

```text
Before workers: start/select database -> run real application migrations once
  Activated file: select database -> create root client/pool -> beforeAll
    Test attempt: BEGIN -> beforeEach -> test body -> afterEach -> ROLLBACK
    Next attempt: a new transaction, including on a retry
  After the file: afterAll -> close root client/pool -> configured resource cleanup
After workers: infrastructure owner stops the disposable database, if it created one
```

A declaration activates the file; the runner installer connects that declaration to execution.
The database adapter supplies the transaction-bound client. Together they keep awaited operations
in the same transaction through the test's fixtures and teardown. Application code needs to receive
that client, for example through constructor injection; see [NestJS wiring](#inject-the-transaction-into-nestjs-repositories).

## Configure Jest once

Jest needs **both** the installer and the Data Integration Node environment. The installer
registers the context inside Jest's test sandbox; the environment connects it to test execution.
The annotation by itself cannot activate this behavior. Keep quick start steps 1 and 3, and use
this section in place of its Vitest setup. The root TypeScript options are shown in the quick
start; select Jest types as described below.

```ts
// test/jest.setup.ts
import { installJestDataIntegrationTestSupport } from '@integration-testing/data/jest';
import { dataContext } from './data-context.js';

installJestDataIntegrationTestSupport(dataContext);
```

```js
// jest.integration.config.cjs
module.exports = {
  testEnvironment: '@integration-testing/data/jest/environment',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testMatch: ['**/test/**/*.integration.test.ts'],
  maxWorkers: 2,
  testTimeout: 30_000,
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: './tsconfig.jest.json' }],
  },
};
```

<details>
<summary>TypeScript setup for Jest (tsconfig.jest.json)</summary>

Create this alongside the quick start's root `tsconfig.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node", "jest"],
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["test/vitest.setup.ts"]
}
```

This Jest-specific config is for the CommonJS test transform; use the root NodeNext configuration
for standalone TypeScript checking of package exports. If using only Jest, set the root `tsconfig.json` types to `["node", "jest"]` as well. The `.js`
relative imports above are mapped to TypeScript application files by Jest; the installed library
still resolves through its public package exports.

</details>

After the database is migrated, run the same `test/products.integration.test.ts` file:

```sh
npx jest --config jest.integration.config.cjs
```

Keep `DATABASE_URL` exported as in the quick start. For a disposable database, use the launcher
below with `jest` instead. You do not need to install Vitest in a Jest-only project.

## Complete setup: Testcontainers with pg and either runner

Keep the quick start's context, runner setup, and tests. This walkthrough adds **one launcher
for both runners**, with the published
`@integration-testing/testcontainers` runtime API. Run the commands from your application's root.
The runner-specific native global-setup alternatives are shown later. Set `"type": "module"` in
your application's `package.json` for this walkthrough; Jest configuration files remain `.cjs`.

Install the published infrastructure package:

```sh
npm install --save-dev @integration-testing/testcontainers@0.1.0
```

Docker must be running. The application must already have a real migration command named
`migrate` in `package.json`.
That command must read `DATABASE_URL`. Use the same migration files and migration tool as your
application deployment, such as your Prisma migration command or TypeORM migration command.
The [demo's migration entrypoint](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/src/migrate.ts)
is a complete example with migration history. Do not create a different schema inside each test.

The quick start tests assume those migrations create the inventory application's `products` table,
with `sku` and `stock` columns. Substitute your own application tables and repository operations.

### 1. Run application migrations against the supplied URL

```js
// scripts/migrate-test-database.mjs
import { spawn } from 'node:child_process';

export async function runApplicationMigrations(databaseUrl) {
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'migrate'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Application migrations exited with code ${code}`));
    });
  });
}
```

This invokes your application command in a separate process. It does not print connection URLs,
change the schema model, or make migrations part of per-test transactions.

### 2. Start infrastructure, migrate once, then launch the selected runner

```js
// scripts/test-integration.mjs
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  Container,
  ContainerRuntime,
  createDefaultContainerRegistry,
} from '@integration-testing/testcontainers';
import { runApplicationMigrations } from './migrate-test-database.mjs';

const runner = process.argv[2] ?? 'vitest';
if (runner !== 'jest' && runner !== 'vitest') {
  throw new Error('Choose jest or vitest');
}
const runtime = new ContainerRuntime(createDefaultContainerRegistry());
const failures = [];

try {
  const resources = await runtime.start([Container.PostgreSql]);
  const databaseUrl = resources.get(Container.PostgreSql).connectionUri;
  await runApplicationMigrations(databaseUrl);

  const args = runner === 'jest'
    ? [resolve('node_modules/jest/bin/jest.js'), '--config', 'jest.integration.config.cjs']
    : [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.integration.config.ts'];

  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [...args, ...process.argv.slice(3)], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${runner} exited with code ${code}`));
    });
  });
} catch (error) {
  failures.push(error);
}
try { await runtime.stop(); } catch (error) { failures.push(error); }
if (failures.length) throw new AggregateError(failures, 'Integration run failed');
```

Use Node to execute this launcher. Both runners receive the same connection facts before their
workers start. Each worker creates its own client pool; live Docker handles and transaction
objects are not transferred between processes. The container is stopped after the runner exits,
including an ordinary failing test run. Forced process termination is not a JavaScript cleanup guarantee.

### 3. Run the paired lifecycle

```sh
node scripts/test-integration.mjs vitest
# Or, with the Jest configuration:
node scripts/test-integration.mjs jest
```

The launcher supplies `DATABASE_URL`, invokes your real migrations once, runs the selected runner,
and stops its container. You do not need to export a database URL for this mode. Your transactional
test files and `test/data-context.ts` stay the same.

## Alternative: native Testcontainers global setup

The launcher above is useful when one orchestration entrypoint should work with either runner.
For IDE integration, you can instead attach Testcontainers Integration's lifecycle to the runner's
native global setup. **Choose this approach or the launcher, not both for one run.**

### Vitest global setup

Keep the shared `test/data-context.ts` and migration helper above. Add:

```ts
// test/containers.global-setup.ts
import { Container, createDefaultContainerRegistry } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';
import { runApplicationMigrations } from '../scripts/migrate-test-database.mjs';

const lifecycle = createVitestContainerGlobalSetup({
  root: process.cwd(),
  registry: createDefaultContainerRegistry(),
  requiredContainers: [Container.PostgreSql],
  prepareResources: async (resources) => {
    await runApplicationMigrations(resources.get(Container.PostgreSql).connectionUri);
    return undefined;
  },
});
export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;
```

Replace `test/vitest.setup.ts` with:

```ts
import { Container, ContainerResources } from '@integration-testing/testcontainers';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from '@integration-testing/testcontainers/vitest';
import { inject } from 'vitest';
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data/vitest';
import { dataContext } from './data-context.js';

const resources = ContainerResources.fromSerializable(inject(CONTAINER_RESOURCES_CONTEXT_KEY));
process.env.DATABASE_URL = resources.get(Container.PostgreSql).connectionUri;
installVitestDataIntegrationTestSupport(dataContext);
```

Add `globalSetup: ['./test/containers.global-setup.ts']` to the Vitest `test` configuration, then run
`npx vitest run --config vitest.integration.config.ts`. `getResources` reads the injected URL only
when the file lifecycle starts, after setup has assigned it.

For TypeScript checking of the shared JavaScript migration helper, add a declaration beside it:

```ts
// scripts/migrate-test-database.d.mts
export function runApplicationMigrations(databaseUrl: string): Promise<void>;
```

The [small container example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers)
also demonstrates annotation discovery: omit `requiredContainers` and use the named
`@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'shared' } })` alongside
`@DataIntegrationTest` on the same marker class. In that setup, global migrations and each file's
`getResources` select `getNamed('database', Container.PostgreSql)`.
With explicit `requiredContainers`, the decorator-free data declaration works without a container marker.

### Jest global setup

The Testcontainers lifecycle lives in the coordinator, while the data context stays in the
Jest test sandbox. Use CommonJS lifecycle files so Jest can load them directly:

```js
// test/containers.lifecycle.cjs
const { Container, createDefaultContainerRegistry } = require('@integration-testing/testcontainers');
const { createJestContainerGlobalSetup } = require('@integration-testing/testcontainers/jest');

module.exports = createJestContainerGlobalSetup({
  root: process.cwd(),
  registry: createDefaultContainerRegistry(),
  requiredContainers: [Container.PostgreSql],
  prepareResources: async (resources) => {
    const { runApplicationMigrations } = await import('../scripts/migrate-test-database.mjs');
    await runApplicationMigrations(resources.get(Container.PostgreSql).connectionUri);
    return undefined;
  },
});
```

```js
// test/containers.global-setup.cjs
module.exports = require('./containers.lifecycle.cjs').setup;
```

```js
// test/containers.global-teardown.cjs
module.exports = require('./containers.lifecycle.cjs').teardown;
```

Add these entries to `jest.integration.config.cjs`, retaining the Data Integration test environment:

```js
globalSetup: '<rootDir>/test/containers.global-setup.cjs',
globalTeardown: '<rootDir>/test/containers.global-teardown.cjs',
```

Replace `test/jest.setup.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { Container, ContainerResources } from '@integration-testing/testcontainers';
import type { SerializableContainerResources } from '@integration-testing/testcontainers';
import { JEST_CONTAINER_RESOURCES_PATH_ENV } from '@integration-testing/testcontainers/jest';
import { installJestDataIntegrationTestSupport } from '@integration-testing/data/jest';
import { dataContext } from './data-context.js';

const resourcePath = process.env[JEST_CONTAINER_RESOURCES_PATH_ENV];
if (!resourcePath) throw new Error('Testcontainers global setup did not provide resources');
const resources = ContainerResources.fromSerializable(
  JSON.parse(readFileSync(resourcePath, 'utf8')) as SerializableContainerResources,
);
process.env.DATABASE_URL = resources.get(Container.PostgreSql).connectionUri;
installJestDataIntegrationTestSupport(dataContext);
```

Run `npx jest --config jest.integration.config.cjs`. Testcontainers Integration transfers serializable
connection facts to workers; it does not transfer its coordinator's clients or transaction handles.
The `prepareResources` callback completes migrations before the database is exposed to test workers.

## Alternative: an existing PostgreSQL database

For Docker Compose, a CI service container, or an existing disposable test database, keep the
same data context, runner setup, and tests from the quick start. Supply `DATABASE_URL`,
run your migrations once, and invoke the runner directly:

```sh
export DATABASE_URL='postgresql://test_user:test_password@localhost:5432/inventory_test'
npm run migrate
npx vitest run --config vitest.integration.config.ts
# Or:
npx jest --config jest.integration.config.cjs
```

Use the plain runner installers, without the native Testcontainers global setup or resource
injection variants. The data library closes its own pool; it does not drop an externally supplied
database. Testcontainers Integration is optional for this setup and need not be installed.

To exercise this mode, run from `examples/nestjs-inventory`:

```sh
DATABASE_URL='postgresql://test_user:test_password@localhost:5432/inventory_test' bun run test:external
```

The demo creates and removes an owned schema in that database, running its real migrations once
before either runner starts. It never drops the supplied database itself.

## Use Prisma instead of pg

Keep your database provisioning, real migration step, runner installer, and file declaration.
Replace the pg context with a context using the application's generated Prisma 6.19 client:

```sh
npm install @prisma/client@6.19.3
npm install --save-dev prisma@6.19.3
npx prisma generate
```

```ts
// test/data-context.ts
import { PrismaClient, type Prisma } from '@prisma/client';
import { createDataIntegrationTestContext } from '@integration-testing/data';
import { PrismaTransactionAdapter } from '@integration-testing/data/prisma';

export const dataContext = createDataIntegrationTestContext({
  getResources: () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    return url;
  },
  createDatabase: async (url) => url,
  createClient: async (url) => new PrismaClient({ datasourceUrl: url }),
  closeClient: async (client) => { await client.$disconnect(); },
  dropDatabase: async () => {},
  transactions: new PrismaTransactionAdapter<PrismaClient, Prisma.TransactionClient>({
    maxWait: 10_000,
    timeout: 30_000,
  }),
});
```

Use your generated-client output path instead of `@prisma/client` if your Prisma generator has
custom output. Prisma's datasource provider and migrations must match the selected database.
For a Prisma-managed application, the launcher's `npm run migrate` can invoke
`prisma migrate deploy` against the supplied URL.

Repository tests receive a typed Prisma transaction client:

```ts
const client = dataContext.getCurrentContext().client;
await client.product.create({ data: { sku: 'book', stock: 10 } });
const product = await client.product.findUnique({ where: { sku: 'book' } });
expect(product?.stock).toBe(10);
```

Prisma's interactive transaction stays open across each test's hooks and body. The adapter forces
rollback after successful work as well as failures. Do not substitute a separately constructed
root `PrismaClient` in your repository; its operations would use another transaction.

## Use TypeORM instead of pg

Keep the same infrastructure and runner setup. Install the application driver and TypeORM:

```sh
npm install typeorm@~0.3.28 pg@8 reflect-metadata
```

```ts
// test/data-context.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDataIntegrationTestContext } from '@integration-testing/data';
import { TypeOrmTransactionAdapter } from '@integration-testing/data/typeorm';
import { ProductEntity, ReservationEntity } from '../src/entities.js';

export const dataContext = createDataIntegrationTestContext({
  getResources: () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    return url;
  },
  createDatabase: async (url) => url,
  createClient: async (url) => new DataSource({
    type: 'postgres',
    url,
    entities: [ProductEntity, ReservationEntity],
    synchronize: false,
    migrationsRun: false,
  }).initialize(),
  closeClient: async (source) => { await source.destroy(); },
  dropDatabase: async () => {},
  transactions: new TypeOrmTransactionAdapter(),
});
```

`ProductEntity` and `ReservationEntity` are the application's own entity definitions; the demo
has complete [EntitySchema examples](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/src/typeorm-repository.ts).
Run your application migrations globally; do not enable schema synchronization or per-file migration execution.

Inside a test or fixture, get repositories from the scoped manager:

```ts
const manager = dataContext.getCurrentContext().client; // EntityManager
const products = manager.getRepository(ProductEntity);
await products.insert({ sku: 'book', stock: 10 });
expect((await products.findOneBy({ sku: 'book' }))?.stock).toBe(10);
```

`TypeOrmTransactionAdapter` connects a dedicated `QueryRunner`, begins a transaction, supplies
that runner's manager, then rolls back and releases it. A repository obtained from the root
`DataSource.manager` does not belong to the test transaction.

## Alternative: Prisma with SQLite, without Docker

Use the Prisma context above with a Prisma client generated from the application's SQLite schema.
Supply a file URL and apply the application's SQLite migrations before starting the runner:

```sh
export DATABASE_URL='file:./integration-test.db'
npx prisma generate --schema prisma/sqlite.prisma
npx prisma migrate deploy --schema prisma/sqlite.prisma
npx vitest run --config vitest.integration.config.ts
# Or run Jest with its configuration.
```

Choose a disposable file location deliberately; Prisma resolves relative file URLs according to
its datasource configuration. Remove only a file owned by the test setup after all workers exit.
Do not run PostgreSQL migrations against SQLite or treat SQLite coverage as proof of PostgreSQL behavior.

When files share one SQLite database, set `fileParallelism: false` in Vitest and `maxWorkers: 1`
in Jest. Tests in each activated file are already sequential. This avoids competing writers
across files; PostgreSQL's shared-schema configuration can use parallel files.

For a ready-to-run setup that creates a temporary SQLite file, migrates it globally, tests both
runners, and deletes its owned file afterward:

```sh
# From the repository root, no Docker required:
bun run test:consumer:sqlite
```

The demo uses its own versioned migration entrypoint for SQLite. The Prisma CLI commands above
are for applications whose SQLite migrations are maintained by Prisma.

## Inject the transaction into NestJS repositories

The testing library does not patch production clients. Override the database provider in a NestJS
`TestingModule` with the scoped client. Application services and repositories should not import
`@integration-testing/data`.

For an application exposing `DATABASE_CLIENT`, `InventoryRepository`, and `InventoryService`,
the pg implementation can be tested like this:

```ts
import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataIntegrationTest } from '@integration-testing/data';
import { dataContext } from './data-context.js';
import { DATABASE_CLIENT, InventoryRepository, InventoryService } from '../src/inventory.js';
import { PgInventoryRepository } from '../src/pg-repository.js';

@DataIntegrationTest
export class InventoryRepositoryTest {}

let app: TestingModule;
let repository: InventoryRepository;
let service: InventoryService;

beforeEach(async () => {
  app = await Test.createTestingModule({
    providers: [
      InventoryService,
      { provide: DATABASE_CLIENT, useValue: null },
      { provide: InventoryRepository, useClass: PgInventoryRepository },
    ],
  })
    .overrideProvider(DATABASE_CLIENT)
    .useValue(dataContext.getCurrentContext().client)
    .compile();

  repository = app.get(InventoryRepository);
  service = app.get(InventoryService);
  await repository.addProduct('book', 10);
});

test('reserves inventory through the application service', async () => {
  await service.reserve('book', 3, 'order-1');
  expect(await repository.stock('book')).toBe(7);
  expect(await repository.reservationCount()).toBe(1);
});

afterEach(async () => { await app?.close(); });
```

Install `@nestjs/testing` matching your application's NestJS version. Use your normal NestJS
TypeScript settings and explicit injection tokens. The demo supplies the referenced application
classes and repeats the same wiring for Prisma and TypeORM. Keep `src/**/*.ts` in the root
TypeScript configuration's `include` list so Vitest applies the decorator configuration to the
application classes as well as the tests.

If your TypeORM repository is injected with `@InjectRepository(Product)`, override
`getRepositoryToken(Product)` from `@nestjs/typeorm` with
`dataContext.getCurrentContext().client.getRepository(Product)` during `beforeEach` instead.
Do not let an imported production module start a second pool and silently bypass the override.

**HTTP requests are a separate case.** A server using its own connection pool does not automatically
join the test transaction. Repository tests with explicit provider overrides are covered. HTTP
isolation requires an explicit strategy for the application, such as transaction propagation or
separately owned database state and cleanup; this release does not supply automatic HTTP interception.

## Migrations, parallel files, and resource ownership

`prepareDatabase` is a **per-activated-file** hook, not a global migration coordinator. With one
shared database, run application migrations globally before workers, then omit the hook. Running
`CREATE TABLE IF NOT EXISTS` from multiple workers can still race on PostgreSQL catalog changes.

| Resource | Owner in the recommended setup | Cleanup |
| --- | --- | --- |
| PostgreSQL container and network | Testcontainers Integration launcher or global setup | After all test workers finish |
| Application schema | Global application migration step | Removed with the disposable container |
| Root client or pool | Each activated file's data context | `closeClient` after suite hooks |
| Transaction-scoped client | Each test attempt's adapter | Rollback and release after per-test hooks |
| Externally supplied database | External infrastructure owner | Never dropped by the sample context |

Parallel files can share a globally migrated PostgreSQL schema for rollback-only repository tests.
Use distinct fixture keys where possible: rollback does not eliminate lock contention, deadlocks,
sequence advancement, or other database concurrency behavior. Tests requiring commits need a
separate isolation strategy.

The example's optional `bun run test:per-file` command (from `examples/nestjs-inventory`) checks resource ownership using a schema per
file. Each schema runs the **same application migrations**. It is additional coverage, not the
default setup and not permission for tests to invent tables that differ from production.

## Compatibility between the two packages

The examples pin **`@integration-testing/testcontainers@0.1.0`**. The connection URL is the
boundary between the libraries: Testcontainers Integration supplies a real database endpoint;
Data Integration creates the configured driver and controls transactions through its adapter.
Neither library needs to import the other's source, and Data Integration does not require
Testcontainers as a dependency.

| Setup with Testcontainers Integration 0.1.0 | Data Integration compatibility |
| --- | --- |
| Shared `ContainerRuntime` launcher | Verified with PostgreSQL + pg, Prisma 6.19, and TypeORM 0.3 under Jest and Vitest, using an installed data package archive |
| Shared native `createVitestContainerGlobalSetup` | Verified with pg, global migrations, and transaction-scoped tests |
| Shared native `createJestContainerGlobalSetup` | Verified with pg while retaining `@integration-testing/data/jest/environment` |
| Named `@RequiredContainer` with `isolation: 'shared'` and manual global setup | Demonstrated by the small Vitest example; both files select the same named database |
| Generated annotation/project file setup, including `isolation: 'dedicated'` | Not a supported drop-in pairing in this release; file lifecycle coordination is still needed |
| RabbitMQ, MongoDB, or SQL Server containers | Available infrastructure in Testcontainers Integration; this does not add transactional adapter coverage to Data Integration |

**Upgrading from the older Testcontainers beta:** replace the positional
`@RequiredContainer(Container.PostgreSql)` declaration with its named form:

```ts
import { Container, RequiredContainer } from '@integration-testing/testcontainers';
import { DataIntegrationTest } from '@integration-testing/data';

@RequiredContainer({
  database: { kind: Container.PostgreSql, isolation: 'shared' },
})
@DataIntegrationTest
export class InventoryIntegrationTest {}
```

With discovery-based global setup, select that resource using
`resources.getNamed('database', Container.PostgreSql)`. The two decorators have separate jobs:
`@RequiredContainer` declares infrastructure, while `@DataIntegrationTest` activates the data
runner integration. The complete imports and setup are in the
[small container example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers).
The explicit runtime launcher and `requiredContainers` global-setup examples below need only
the data declaration. `@ApplicationIntegrationTest` belongs to Testcontainers Integration's
application lifecycle and is not required for these direct database/repository setups.

**Resource handoff in 0.1.0:** `injectedContainerResources()` now reads the active file lifecycle,
so it cannot supply resources during Data Integration's earlier initialization. The manual
global-setup examples below restore the shared resources through the exported Vitest context key
or Jest resource-file environment key. They do not install Testcontainers' generated file setup.

**Why dedicated containers need more work:** Testcontainers Integration's generated file setup
starts them in `beforeAll`. Data Integration initializes its file context earlier, in Vitest's
`aroundAll` or Jest's `run_start`, so the dedicated resource is not yet available at that point.
Simply stacking annotations or generated setup files does not establish the necessary startup
and teardown ordering. Use the shared launcher or manual global setup documented here.
A dedicated container is per test file, not per test transaction; it would still need the same
application migrations and explicit transaction-client wiring.

## What it does and does not do

Use this library for **direct database and repository integration tests**: queries, constraints,
and multi-write application operations that can run through the supplied transaction client.

| The library handles | Your application supplies |
| --- | --- |
| A transaction for each test attempt, including retries | A reachable test database and its real application migrations |
| The same typed transaction client in `beforeEach`, the test, and `afterEach` | Awaited database operations using that client |
| Rollback after successful and failing tests, with cleanup failures reported | Repository or NestJS provider wiring that passes the transaction client into application code |
| Runner lifecycle integration for Jest and Vitest | One context module and the appropriate runner setup |

**It does not automatically make all application activity transactional.** It does not patch a
production client, intercept HTTP requests, capture another pool's writes, or roll back messages
and background jobs. It does not run migrations automatically or create your application tables.
`beforeAll` and `afterAll` are outside per-test transactions. Concurrent tests within an activated
file are unsupported; parallel files need deliberate fixture and database ownership choices.
See [the rollback boundaries](#rollback-boundaries) before using it for end-to-end tests.

You can already write rollback hooks by hand. This package is useful when you want to reuse one
typed context and lifecycle contract across supported clients and runners. For one small suite,
ordinary hooks may be sufficient; the [handwritten comparison](#examples-comparison-and-verification)
uses the same application behavior so you can decide.

## Rollback boundaries

The rollback guarantee covers **awaited operations using the supplied transaction client**.
Use the following boundaries to decide whether this is the right isolation strategy for a test:

| Situation | Behavior and what to do |
| --- | --- |
| Direct queries or repository calls using the supplied client | Included in the test transaction, including per-test fixtures and teardown |
| A root client, another pool, or a separately created Prisma client | Outside the transaction; pass the scoped client to the repository instead |
| A NestJS HTTP request or background worker | Not automatically enrolled; an independently configured connection may commit writes |
| Application migrations or shared schema preparation | Application-owned; run once globally before workers for a shared database |
| Explicit commits or database operations that cannot be rolled back | Outside the guarantee; use a separate isolation and cleanup strategy |
| Queue messages, network calls, files, or other external effects | Not undone by database rollback; manage those resources separately |
| Parallel test files sharing a database | Transactions isolate their uncommitted data, but locks, deadlocks, and sequences still matter; avoid conflicting fixtures |
| `.concurrent` or inherited concurrent tests in an activated file | Rejected; run tests sequentially within the file |
| Callback-style `done` tests/hooks | Unsupported; return a promise or use `async`/`await` |
| A test timeout, unawaited work, or forced process termination | Arbitrary JavaScript cannot be forcibly cancelled; a timeout is not proof that application work stopped |
| Cucumber or a custom runner | No shipped adapter; runner-neutral core does not mean automatic runner support |

Do not retain a scoped client after its test ends. Context access is invalidated when the
transaction finishes. Rollback/cleanup failures are reported as failures, not evidence of isolation;
inspect and resolve them rather than assuming that a failed cleanup reset the database.

## Lifecycle contract and troubleshooting

| API or option | Meaning |
| --- | --- |
| `createDataIntegrationTestContext(configuration)` | Creates the shared lifecycle manager and typed context accessor |
| `@DataIntegrationTest` / `declareDataIntegrationTest()` | One whole-file opt-in declaration; requires a runner installer |
| `getResources()` | Gets connection facts from your infrastructure setup |
| `createDatabase(resources)` | Selects an existing database or creates explicitly owned state |
| `createClient(database)` | Creates the root client for one activated file |
| `prepareDatabase(client, database)` | Optional per-file preparation; not shared global migrations |
| `closeClient(client)` | Closes the file's root client |
| `dropDatabase(resources, database)` | Removes only state that this configuration owns; can be a no-op |
| `transactions` | Adapter that supplies a transaction client and completes rollback |
| `transactionLifecycleTimeoutMs` | Installer option bounding acquisition and rollback; defaults to 10000 ms |

Both runner installers accept lifecycle timing as their second argument:

```ts
installJestDataIntegrationTestSupport(dataContext, {
  transactionLifecycleTimeoutMs: 15_000,
});
// Use the same option with installVitestDataIntegrationTestSupport.
```

This lifecycle timeout is separate from the runner's test timeout and Prisma's interactive
transaction timeout. Configure driver connection and query timeouts for your environment too.
A lifecycle bound prevents an indefinitely pending session; it cannot forcibly cancel arbitrary
JavaScript or promise work in your application.

- Each retry gets a new transaction. Rollback failures remain visible even if a later retry passes.
- Assertion failures are preserved alongside rollback, release, and file cleanup errors. Expected-failure
  semantics cannot hide infrastructure errors.
- Resource cleanup runs after user suite hooks, is idempotent, and is attempted after initialization failures.
  A factory that fails before returning an allocated resource must clean up that resource itself.
- Completed context access is invalidated. Do not cache the transaction client, launch unawaited
  database work, or continue using it after the test finishes.
- Async and synchronous test bodies and hooks are supported. Callback-style `done` is unsupported.
- Keep default test-file isolation enabled. Do not reset the module containing your context during a test.

| Symptom | Check |
| --- | --- |
| Adding the annotation changes nothing | Configure the runner installer; Jest also needs `/jest/environment` |
| Context is unavailable | Read it inside the active test or per-test hooks, not collection, `beforeAll`, or `afterAll` |
| Writes persist | Confirm the actual repository uses the supplied transaction client, not another pool |
| Parallel schema creation fails | Move real migrations from `prepareDatabase` to global setup |
| SQLite writer locks or timeouts | Run files serially when they share a SQLite database |
| Jest reports callback-style hooks | Return a promise or use `async`; remove the `done` parameter |
| Concurrent tests are rejected | Run tests sequentially within the file; use appropriate parallel file isolation |
| A test timeout is followed by more application work | The runner timed out waiting; it did not cancel arbitrary JavaScript |

Rollback covers **awaited operations using the supplied transaction client**. It does not capture
unrelated connections, background workers, HTTP requests, explicit commits, nontransactional
operations, or changes to other services such as RabbitMQ.

## Runner-neutral core and other runners

The core lifecycle manager has no Jest, Vitest, or Cucumber dependency. Its public
`beforeTestClass`, `executeTestMethod`, `afterTestClass`, and `getCurrentContext` methods can be
used by a custom integration. Database adapters implement the existing
`TransactionAdapter<RootClient, TransactionClient>` callback contract.

**Jest and Vitest integrations are implemented and tested. Cucumber integration is not shipped.**
A Cucumber or custom-harness adapter must connect its own scenario/test boundaries, fixtures,
retries, async context, and failure reporting to the core. Adding a decorator alone cannot make
an unsupported runner do that work. The shared transaction-session helper is currently internal.

Jest's integration uses public Circus events and a sandbox-local bridge; it does not replace
global `test` or `describe` or import private Circus modules. Vitest uses `aroundAll` and
`aroundEach`. Custom Jest environments and disabled runner isolation are not in the verified contract.

## Examples, comparison, and verification

**Try the complete [NestJS inventory demo](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory)**
to see the pairing with Prisma, pg, and TypeORM, under both Jest and Vitest:

```sh
git clone https://github.com/RolandSall/data-integration-testing.git
cd data-integration-testing
bun install --frozen-lockfile
bun run build
bun run generate
bun run typecheck
bun run --cwd examples/nestjs-inventory test
```

The example uses the published Testcontainers Integration package and the local compiled Data
Integration package. `bun run test:consumer` also copies it outside the workspace and installs the
packed data library to verify real consumer behavior without workspace links or source aliases.
Its default run applies application migrations before workers start and verifies rollback through
independent root connections. Docker is required for its PostgreSQL container runs.

All examples live in this repository under `examples/`. They are **not shipped to npm**. Only
`packages/data` is published, with an allowlist of compiled outputs, declarations, README, and
license. Example applications, migrations, tests, and their dependencies remain repository-only.
The consumer check copies the NestJS example outside the workspace and installs a freshly packed
archive, preserving independent consumer verification without a separate repository.

| Example | What it demonstrates |
| --- | --- |
| [NestJS inventory demo](https://github.com/RolandSall/data-integration-testing/tree/main/examples/nestjs-inventory) | Published Testcontainers Integration, installed data artifact, all supported clients/runners, application migrations, independent rollback checks |
| [Demo application provider wiring](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/application.ts) | Explicit transaction-client injection without testing imports in application source |
| [Handwritten pg baseline](https://github.com/RolandSall/data-integration-testing/blob/main/examples/nestjs-inventory/test/baseline.test.ts) | The same application scenarios with ordinary Jest/Vitest hooks |
| [Small pg/container example](https://github.com/RolandSall/data-integration-testing/tree/main/examples/with-testcontainers) | Combined annotations and native Vitest global setup |
| [Small Prisma/SQLite example](https://github.com/RolandSall/data-integration-testing/tree/4a1805f20f60ebc8fd08d6156a682d3ca400caf0/examples/without-testcontainers) | Minimal adapter wiring; its tiny schema fixture is not the production-migration walkthrough |

Ordinary hooks can implement transaction rollback. This library provides a consistent typed
context and tested lifecycle/failure behavior across supported clients and runners. Application
migrations and provider wiring remain explicit. No performance or maintenance-time gains are claimed.

For maintainers, from this repository's root:

```sh
bun install --frozen-lockfile
bun run verify                # Audit, build, types, lint, unit, runner and package checks
bun run pack:check:docker      # Installed PostgreSQL and SQLite examples
bun run test:runners:minimum   # Minimum supported Jest integration
bun run test:consumer          # Current packed output in an isolated copy of the repository example
```

The behavioral checks cover nested fixtures, retries, skips, declaration isolation, unsupported
concurrency, acquisition and cleanup failures, expected-failure handling, and deliberate failing
child processes. Consumer checks exercise real PostgreSQL/SQLite, connection loss, timeouts,
parallel files, external database URLs, and root-connection rollback verification. Package checks
cover optional dependency independence and ESM/CommonJS runtime and declaration resolution.

See [release instructions](https://github.com/RolandSall/data-integration-testing/blob/4a1805f20f60ebc8fd08d6156a682d3ca400caf0/docs/releasing.md)
for publication and trusted publishing. Read the
[Testcontainers Integration documentation](https://github.com/RolandSall/testcontainers-integration#readme)
for its additional infrastructure capabilities; those do not expand this package's tested transaction matrix.

MIT license.

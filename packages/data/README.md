# @integration-testing/data

**Write isolated database integration tests with a consistent API across supported test runners and database clients.**

Configure the database and runner once. Add `@DataIntegrationTest` or
`declareDataIntegrationTest()` to a test file. Its fixtures, tests, and teardown then use a
transaction-scoped client whose writes roll back after every test attempt.

## Recommended pairing: Testcontainers Integration + Data Integration

Use **[@integration-testing/testcontainers](https://www.npmjs.com/package/@integration-testing/testcontainers)**
together with this library for repeatable integration tests against a real PostgreSQL instance.
Both packages belong to the `@integration-testing` family and solve complementary parts of the setup:

- **[@integration-testing/testcontainers](https://www.npmjs.com/package/@integration-testing/testcontainers)**
  starts disposable infrastructure, provides typed connection resources with mapped ports, and
  stops the containers and network after the run. Use its published package to keep Docker
  provisioning out of individual tests.
- **@integration-testing/data** connects your database client to that infrastructure, makes a
  transaction-scoped client available to fixtures and repositories, and rolls back each test's
  writes under Jest or Vitest.

```text
@integration-testing/testcontainers
  Start PostgreSQL once and supply its connection URL
    Application migration command
      Apply the same versioned migrations used to deploy the application, once
        Jest or Vitest workers
          @integration-testing/data
            BEGIN → beforeEach → test → afterEach → ROLLBACK
  Stop PostgreSQL after all workers finish
```

Infrastructure lifecycle and transaction isolation remain separate. You can use the two
libraries together, use this library with an existing database, or use Testcontainers Integration
without this library for tests that need different data-cleanup behavior.

**Try the complete [NestJS inventory demo](https://github.com/RolandSall/data-integration-testing-demo)**
to see the pairing with Prisma, pg, and TypeORM, under both Jest and Vitest:

```sh
git clone https://github.com/RolandSall/data-integration-testing-demo.git
cd data-integration-testing-demo
bun install --frozen-lockfile
bun run generate
bun run typecheck
bun run test
```

The demo installs the published Testcontainers Integration package and a packed Data Integration
candidate. It does not resolve library source through workspace links or TypeScript aliases.
Its default run applies application migrations before workers start and verifies rollback through
independent root connections. Docker is required for its PostgreSQL container runs.

## Contents

- [Compatibility and installation](#compatibility-and-installation)
- [Complete setup: Testcontainers with pg and either runner](#complete-setup-testcontainers-with-pg-and-either-runner)
- [Configure Vitest once](#configure-vitest-once)
- [Configure Jest once](#configure-jest-once)
- [Write the same transactional tests](#write-the-same-transactional-tests)
- [Alternative: native Testcontainers global setup](#alternative-native-testcontainers-global-setup)
- [Alternative: an existing PostgreSQL database](#alternative-an-existing-postgresql-database)
- [Use Prisma instead of pg](#use-prisma-instead-of-pg)
- [Use TypeORM instead of pg](#use-typeorm-instead-of-pg)
- [Alternative: Prisma with SQLite, without Docker](#alternative-prisma-with-sqlite-without-docker)
- [Inject the transaction into NestJS repositories](#inject-the-transaction-into-nestjs-repositories)
- [Migrations, parallel files, and resource ownership](#migrations-parallel-files-and-resource-ownership)
- [Lifecycle contract and troubleshooting](#lifecycle-contract-and-troubleshooting)
- [Runner-neutral core and other runners](#runner-neutral-core-and-other-runners)
- [Examples, comparison, and verification](#examples-comparison-and-verification)

## Compatibility and installation

| Runner | PostgreSQL clients | SQLite client |
| --- | --- | --- |
| Jest 30.1+, below 31, with the package's Node environment | pg 8, Prisma 6.19, TypeORM 0.3 | Prisma 6.19 |
| Vitest 4.1 | pg 8, Prisma 6.19, TypeORM 0.3 | Prisma 6.19 |

Use Node.js 22.22 or newer. The real-database matrix covers both runners and all combinations
above. Other engines, newer client majors, and other runners are outside that verified matrix.
SQL Server URL construction remains available through `/prisma/sql-server`; that helper does
not establish SQL Server transaction support.

**Publication status:** Data Integration's first candidate is `0.1.0-beta.0`; it is not yet
published to npm. To use it now, copy the archive from the demo's
[`vendor` directory](https://github.com/RolandSall/data-integration-testing-demo/tree/main/vendor)
into your application's `vendor` directory and install that exact file:

```sh
npm install --save-dev ./vendor/integration-testing-data-0.1.0-beta.0-4a1805f.tgz
```

After publication, the installation will be `npm install --save-dev @integration-testing/data@beta`.
The Testcontainers Integration package is already published. The examples and independent consumer
pin its tested `0.1.0-beta.0` release for reproducibility:

```sh
npm install --save-dev @integration-testing/testcontainers@0.1.0-beta.0
npm install pg@8
npm install --save-dev typescript@5.9.3 @types/node@22 @types/pg@8
```

Choose a runner, or install both to run the same scenarios under both:

```sh
# Vitest
npm install --save-dev vitest@~4.1.11

# Jest
npm install --save-dev jest@~30.4.2 jest-environment-node@~30.4.1 ts-jest@^29.4.1 @types/jest@30
```

Runner and driver dependencies are optional peers, confined to their corresponding entrypoints.
Core, database adapters, and Jest integration support ESM and CommonJS. Vitest integration is ESM.

## Complete setup: Testcontainers with pg and either runner

This walkthrough uses **one launcher for both runners**, with the published
`@integration-testing/testcontainers` runtime API. Run the commands from your application's root.
The runner-specific native global-setup alternatives are shown later. Set `"type": "module"` in
your application's `package.json` for this walkthrough; Jest configuration files remain `.cjs`.

The application must already have a real migration command named `migrate` in `package.json`.
That command must read `DATABASE_URL`. Use the same migration files and migration tool as your
application deployment, such as your Prisma migration command or TypeORM migration command.
The [demo's migration entrypoint](https://github.com/RolandSall/data-integration-testing-demo/blob/main/src/migrate.ts)
is a complete example with migration history. Do not create a different schema inside each test.

The test below assumes those migrations create the inventory application's `products` table,
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

### 3. Export one shared database context

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
  dropDatabase: async () => {}, // The launcher owns the container, not this file.
  transactions: new PgTransactionAdapter(),
});
```

There is intentionally no `prepareDatabase` migration callback here. Migrations finished before
workers started. This shared context module contains no runner imports and works with either
setup below. Export the context once and import that same instance from your test files.

## Configure Vitest once

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

Enable decorators in the application's root TypeScript configuration. For a minimal ESM project:

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

Run the complete container/migration/test lifecycle:

```sh
node scripts/test-integration.mjs vitest
```

The existing `installVitestDataIntegrationTestSupport(configuration)` signature is also supported
and returns a context manager. The factory-based form above makes the context reusable across runners.

## Configure Jest once

Jest needs **both** the installer and the Data Integration Node environment. The installer
registers the context inside Jest's test sandbox; the environment connects it to test execution.
The annotation by itself cannot activate this behavior.

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

Create `tsconfig.jest.json`:

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

```sh
node scripts/test-integration.mjs jest
```

## Write the same transactional tests

With runner globals enabled as above, this file runs unchanged under either runner:

```ts
// test/products.integration.test.ts
import { DataIntegrationTest } from '@integration-testing/data';
import { dataContext } from './data-context.js';

@DataIntegrationTest
export class ProductRepositoryTest {}

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

If you prefer no marker class, replace the decorator and class with:

```ts
import { declareDataIntegrationTest } from '@integration-testing/data';
declareDataIntegrationTest();
```

Use exactly one declaration per activated file. Do not use both forms in the same file. Unmarked
files do not activate database resources. The declaration must execute during test-file collection,
before tests run. Tests inside activated files run sequentially; do not use `.concurrent`.

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
import { Container } from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data/vitest';
import { dataContext } from './data-context.js';

process.env.DATABASE_URL = injectedContainerResources().get(Container.PostgreSql).connectionUri;
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

The [small container example](https://github.com/RolandSall/data-integration-testing/tree/4a1805f20f60ebc8fd08d6156a682d3ca400caf0/examples/with-testcontainers)
also demonstrates annotation discovery: omit `requiredContainers` and use literal
`@RequiredContainer(Container.PostgreSql)` alongside `@DataIntegrationTest` on the same marker class.
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
import { Container } from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/jest';
import { installJestDataIntegrationTestSupport } from '@integration-testing/data/jest';
import { dataContext } from './data-context.js';

process.env.DATABASE_URL = injectedContainerResources().get(Container.PostgreSql).connectionUri;
installJestDataIntegrationTestSupport(dataContext);
```

Run `npx jest --config jest.integration.config.cjs`. Testcontainers Integration transfers serializable
connection facts to workers; it does not transfer its coordinator's clients or transaction handles.
The `prepareResources` callback completes migrations before the database is exposed to test workers.

## Alternative: an existing PostgreSQL database

For Docker Compose, a CI service container, or an existing disposable test database, keep the
same data context, runner setup, and tests from the launcher walkthrough. Supply `DATABASE_URL`,
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

To exercise this mode in the standalone demo:

```sh
DATABASE_URL='postgresql://test_user:test_password@localhost:5432/inventory_test' bun run test:external
```

The demo creates and removes an owned schema in that database, running its real migrations once
before either runner starts. It never drops the supplied database itself.

## Use Prisma instead of pg

Keep the infrastructure launcher, real migration step, runner installer, and file declaration.
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
has complete [EntitySchema examples](https://github.com/RolandSall/data-integration-testing-demo/blob/main/src/typeorm-repository.ts).
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
# From the standalone demo, no Docker required:
bun run verify:sqlite
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

The demo's optional `bun run test:per-file` command checks resource ownership using a schema per
file. Each schema runs the **same application migrations**. It is additional coverage, not the
default setup and not permission for tests to invent tables that differ from production.

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

| Example | What it demonstrates |
| --- | --- |
| [Standalone NestJS inventory demo](https://github.com/RolandSall/data-integration-testing-demo) | Published Testcontainers Integration, installed data artifact, all supported clients/runners, application migrations, independent rollback checks |
| [Demo application provider wiring](https://github.com/RolandSall/data-integration-testing-demo/blob/main/test/application.ts) | Explicit transaction-client injection without testing imports in application source |
| [Handwritten pg baseline](https://github.com/RolandSall/data-integration-testing-demo/blob/main/test/baseline.test.ts) | The same application scenarios with ordinary Jest/Vitest hooks |
| [Small pg/container example](https://github.com/RolandSall/data-integration-testing/tree/4a1805f20f60ebc8fd08d6156a682d3ca400caf0/examples/with-testcontainers) | Combined annotations and native Vitest global setup |
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
bun run test:consumer          # Current packed output in a pinned independent consumer checkout
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

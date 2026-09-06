import { expect, expectTypeOf, test } from 'vitest';
import type { DataIntegrationTestConfiguration } from './data-integration-test-configuration.js';
import { DataIntegrationTestContextManager } from './data-integration-test-context-manager.js';

interface FakeResources {
  readonly server: string;
}

interface FakeDatabase {
  readonly name: string;
}

interface FakeClient {
  readonly records: string[];
}

test(
  'given a configured context manager, when its class and method lifecycle runs, then it exposes a typed transaction client and cleans up',
  async () => {
    const events: string[] = [];
    const rootClient: FakeClient = { records: [] };
    const configuration: DataIntegrationTestConfiguration<
      FakeResources,
      FakeDatabase,
      FakeClient,
      FakeClient
    > = {
      getResources: () => ({ server: 'sql-server' }),
      createDatabase: () => {
        events.push('create database');
        return Promise.resolve({ name: 'example' });
      },
      createClient: () => {
        events.push('create client');
        return Promise.resolve(rootClient);
      },
      prepareDatabase: () => {
        events.push('prepare database');
        return Promise.resolve();
      },
      closeClient: () => {
        events.push('close client');
        return Promise.resolve();
      },
      dropDatabase: () => {
        events.push('drop database');
        return Promise.resolve();
      },
      transactions: {
        rollbackOnly: async (client, work) =>
          work({ records: [...client.records] }),
      },
      logger: {
        info: () => undefined,
        error: () => undefined,
      },
    };
    const contextManager = new DataIntegrationTestContextManager(configuration);

    expect(() => contextManager.getCurrentContext()).toThrow(
      'Data integration context is only available while a test method is running',
    );

    await contextManager.beforeTestClass();
    await contextManager.executeTestMethod('stores a record', () => {
      const context = contextManager.getCurrentContext();
      expectTypeOf(context.client).toEqualTypeOf<FakeClient>();
      expect(context.resources).toEqual({ server: 'sql-server' });
      expect(context.database).toEqual({ name: 'example' });
      context.client.records.push('record');
      expect(context.client.records).toEqual(['record']);
      return Promise.resolve();
    });
    await contextManager.afterTestClass();

    expect(rootClient.records).toEqual([]);
    expect(events).toEqual([
      'create database',
      'create client',
      'prepare database',
      'close client',
      'drop database',
    ]);
    expect(() => contextManager.getCurrentContext()).toThrow(
      'Data integration context is only available while a test method is running',
    );
  },
);

test(
  'given schema is prepared before global setup completes, when a test class starts, then no class-level schema callback is required',
  async () => {
    const events: string[] = [];
    const configuration: DataIntegrationTestConfiguration<
      FakeResources,
      FakeDatabase,
      FakeClient,
      FakeClient
    > = {
      getResources: () => ({ server: 'sql-server' }),
      createDatabase: () => Promise.resolve({ name: 'example' }),
      createClient: () => Promise.resolve({ records: [] }),
      closeClient: () => {
        events.push('close client');
        return Promise.resolve();
      },
      dropDatabase: () => {
        events.push('drop database');
        return Promise.resolve();
      },
      transactions: {
        rollbackOnly: (_client, work) => work({ records: [] }),
      },
      logger: {
        info: () => undefined,
        error: () => undefined,
      },
    };
    const contextManager = new DataIntegrationTestContextManager(configuration);

    await contextManager.beforeTestClass();
    await contextManager.executeTestMethod('loads a record', () => Promise.resolve());
    await contextManager.afterTestClass();

    expect(events).toEqual(['close client', 'drop database']);
  },
);

test('given setup and cleanup both fail, when initialization stops, then both failures survive and teardown does not repeat cleanup', async () => {
  const setupFailure = new Error('schema failed');
  const cleanupFailure = new Error('disconnect failed');
  let closes = 0;
  let drops = 0;
  const manager = new DataIntegrationTestContextManager({
    getResources: () => 'server',
    createDatabase: async () => 'database',
    createClient: async () => ({ records: [] as string[] }),
    prepareDatabase: async () => { throw setupFailure; },
    closeClient: async () => { closes++; throw cleanupFailure; },
    dropDatabase: async () => { drops++; },
    transactions: { rollbackOnly: async (client, work) => work(client) },
    logger: { info: () => {}, error: () => {} },
  });
  await expect(manager.beforeTestClass()).rejects.toMatchObject({
    errors: [setupFailure, expect.objectContaining({ errors: [cleanupFailure] })],
  });
  await manager.afterTestClass();
  expect(closes).toBe(1);
  expect(drops).toBe(1);
});

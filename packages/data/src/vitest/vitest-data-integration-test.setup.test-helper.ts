import type { DataIntegrationTestConfiguration } from '../data-integration-test-configuration.js';
import type { TransactionAdapter } from '../transaction/transaction-adapter.js';
import { installVitestDataIntegrationTestSupport } from './install-vitest-data-integration-test-support.js';

export interface FakeDatabase {
  readonly records: string[];
}

export interface FakeClient {
  readonly records: string[];
}

export const lifecycleEvents: string[] = [];

const transactions: TransactionAdapter<FakeClient, FakeClient> = {
  rollbackOnly: async (client, work) => work({ records: [...client.records] }),
};

const configuration: DataIntegrationTestConfiguration<
  'resources',
  FakeDatabase,
  FakeClient,
  FakeClient
> = {
  getResources: () => {
    lifecycleEvents.push('get resources');
    return 'resources';
  },
  createDatabase: () => Promise.resolve({ records: [] }),
  createClient: (database) => Promise.resolve(database),
  prepareDatabase: () => Promise.resolve(),
  closeClient: () => Promise.resolve(),
  dropDatabase: () => Promise.resolve(),
  transactions,
};

export const testDataIntegrationTestContext =
  installVitestDataIntegrationTestSupport(configuration);

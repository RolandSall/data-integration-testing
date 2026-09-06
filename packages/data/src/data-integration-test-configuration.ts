import type { DataIntegrationTestLogger } from './logging/data-integration-test-logger.js';
import type { TransactionAdapter } from './transaction/transaction-adapter.js';

/** Database-specific operations used by `DataIntegrationTestContextManager`. */
export interface DataIntegrationTestConfiguration<
  TResources,
  TDatabase,
  TRootClient,
  TTransactionClient,
> {
  /** Returns infrastructure resources supplied by any infrastructure provider. */
  getResources(): TResources;
  /** Selects or creates the database used by this test class. */
  createDatabase(resources: TResources): Promise<TDatabase>;
  /** Creates and connects the root database client shared by this test class. */
  createClient(database: TDatabase): Promise<TRootClient>;
  /** Optionally creates or validates application schema before test methods execute. */
  prepareDatabase?(client: TRootClient, database: TDatabase): Promise<void>;
  /** Disconnects the class-level root client. */
  closeClient(client: TRootClient): Promise<void>;
  /** Removes class-owned database state when the configuration created it. */
  dropDatabase(resources: TResources, database: TDatabase): Promise<void>;
  /** Executes each test method inside a rollback-only transaction. */
  readonly transactions: TransactionAdapter<TRootClient, TTransactionClient>;
  /** Optional lifecycle logger. */
  readonly logger?: DataIntegrationTestLogger;
}

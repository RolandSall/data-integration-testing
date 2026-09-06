import type { DataIntegrationTestConfiguration } from './data-integration-test-configuration.js';
import type { DataIntegrationTestContextAccessor } from './data-integration-test-context-accessor.js';
import type { DataIntegrationTestContext } from './data-integration-test-context.js';
import { consoleDataIntegrationTestLogger } from './logging/console-data-integration-test-logger.js';
import type { DataIntegrationTestLogger } from './logging/data-integration-test-logger.js';
import { AsyncTransactionContext } from './transaction/transaction-context.js';

/**
 * Runner-neutral lifecycle manager for one data integration-test class.
 *
 * The naming follows Spring's `TestContextManager`: one manager owns class-level database
 * setup, wraps each test method in a rollback-only transaction, and performs class cleanup.
 * Runner adapters translate their hooks into these lifecycle methods.
 */
export class DataIntegrationTestContextManager<
  TResources,
  TDatabase,
  TRootClient,
  TTransactionClient,
> implements
    DataIntegrationTestContextAccessor<TResources, TDatabase, TTransactionClient>
{
  private readonly contexts = new AsyncTransactionContext<
    { context: DataIntegrationTestContext<TResources, TDatabase, TTransactionClient>; active: boolean }
  >();
  private readonly logger: DataIntegrationTestLogger;
  private resources: TResources | undefined;
  private database: TDatabase | undefined;
  private client: TRootClient | undefined;

  /** Creates a manager from explicit database and transaction operations. */
  constructor(
    private readonly configuration: DataIntegrationTestConfiguration<
      TResources,
      TDatabase,
      TRootClient,
      TTransactionClient
    >,
  ) {
    this.logger = configuration.logger ?? consoleDataIntegrationTestLogger;
  }

  /** Obtains resources, connects the root client, and prepares schema for the test class. */
  async beforeTestClass(): Promise<void> {
    this.logger.info('database', 'preparing data integration test');
    this.resources = this.configuration.getResources();
    try {
      this.database = await this.configuration.createDatabase(this.resources);
      this.logger.info('database', 'connecting database client');
      this.client = await this.configuration.createClient(this.database);
      this.logger.info('database', 'database client connected');
      if (this.configuration.prepareDatabase !== undefined) {
        this.logger.info('database', 'preparing application schema');
        await this.configuration.prepareDatabase(this.client, this.database);
        this.logger.info('database', 'application schema is ready');
      }
    } catch (error) {
      this.logger.error('database', 'data integration setup failed', error);
      try {
        await this.cleanUp();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Data integration setup and cleanup failed');
      } finally {
        this.clearState();
      }
      throw error;
    }
  }

  /** Runs one test method with a transaction-scoped client and guarantees rollback. */
  async executeTestMethod<T>(
    testName: string,
    execute: () => Promise<T>,
  ): Promise<T> {
    const activeResources = this.requireValue(this.resources, 'infrastructure resources');
    const activeDatabase = this.requireValue(this.database, 'test database');
    const activeClient = this.requireValue(this.client, 'database client');
    this.logger.info(
      'transaction',
      `starting rollback-only transaction for "${testName}"`,
    );
    try {
      return await this.configuration.transactions.rollbackOnly(
        activeClient,
        async (transaction) => {
          const lease = { active: true, context: {
            resources: activeResources, database: activeDatabase, client: transaction,
          } };
          try {
            return await this.contexts.run(lease, execute);
          } finally {
            lease.active = false;
          }
        },
      );
    } finally {
      this.logger.info(
        'transaction',
        `rollback-only transaction finished for "${testName}"`,
      );
    }
  }

  /** Disconnects the root client and removes database state owned by the test class. */
  async afterTestClass(): Promise<void> {
    this.logger.info('database', 'cleaning up data integration test');
    try {
      await this.cleanUp();
      this.logger.info('database', 'data integration test cleanup finished');
    } finally {
      this.clearState();
    }
  }

  /** Returns the strongly typed context associated with the current test method. */
  getCurrentContext(): DataIntegrationTestContext<
    TResources,
    TDatabase,
    TTransactionClient
  > {
    const context = this.contexts.current();
    if (context === undefined || !context.active) {
      throw new Error(
        'Data integration context is only available while a test method is running',
      );
    }
    return context.context;
  }

  /** @internal Invalidates access before asynchronous rollback has finished. */
  invalidateCurrentContext(): void {
    const lease = this.contexts.current();
    if (lease) lease.active = false;
  }

  private async cleanUp(): Promise<void> {
    const failures: unknown[] = [];
    if (this.client !== undefined) {
      try {
        await this.configuration.closeClient(this.client);
      } catch (error) {
        failures.push(error);
      }
    }
    if (this.resources !== undefined && this.database !== undefined) {
      try {
        await this.configuration.dropDatabase(this.resources, this.database);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `Data integration test cleanup failed: ${failures.map((failure) => failure instanceof Error ? failure.message : String(failure)).join('; ')}`);
    }
  }

  private clearState(): void {
    this.resources = undefined;
    this.database = undefined;
    this.client = undefined;
  }

  private requireValue<T>(value: T | undefined, name: string): T {
    if (value === undefined) {
      throw new Error(`Missing ${name}. The data integration setup did not complete.`);
    }
    return value;
  }
}

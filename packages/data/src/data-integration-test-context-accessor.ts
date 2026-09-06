import type { DataIntegrationTestContext } from './data-integration-test-context.js';

/** Typed access to the context associated with the currently executing test method. */
export interface DataIntegrationTestContextAccessor<
  TResources,
  TDatabase,
  TTransactionClient,
> {
  /**
   * Returns resources, database, and transaction-scoped client for the current test method.
   *
   * @throws Outside a test method managed by `DataIntegrationTestContextManager`.
   */
  getCurrentContext(): DataIntegrationTestContext<
    TResources,
    TDatabase,
    TTransactionClient
  >;
}

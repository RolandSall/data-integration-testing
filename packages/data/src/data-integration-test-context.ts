/** Values available while one rollback-only test transaction is active. */
export interface DataIntegrationTestContext<
  TResources,
  TDatabase,
  TTransactionClient,
> {
  /** Infrastructure resources used by the test class. */
  readonly resources: TResources;
  /** Database selected or created before test methods execute. */
  readonly database: TDatabase;
  /** Transaction-scoped client that every test operation must use. */
  readonly client: TTransactionClient;
}

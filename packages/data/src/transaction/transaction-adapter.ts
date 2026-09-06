/** ORM-neutral contract for executing test work in a transaction that never commits. */
export interface TransactionAdapter<TRootClient, TTransactionClient> {
  /**
   * Runs work with a transaction-scoped client and rolls back after success or failure.
   * A real test failure must be rethrown unchanged.
   */
  rollbackOnly<T>(
    client: TRootClient,
    work: (transaction: TTransactionClient) => Promise<T>,
  ): Promise<T>;
}

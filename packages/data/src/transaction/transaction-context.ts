import { AsyncLocalStorage } from 'node:async_hooks';

/** Async context that exposes the transaction associated with the current test execution. */
export interface TransactionContext<TTransaction> {
  /** Returns the active transaction, or `undefined` outside registered test work. */
  current(): TTransaction | undefined;
  /** Runs asynchronous work with the supplied transaction as its current value. */
  run<T>(transaction: TTransaction, work: () => Promise<T>): Promise<T>;
}

/** `AsyncLocalStorage` implementation of transaction context propagation. */
export class AsyncTransactionContext<TTransaction>
  implements TransactionContext<TTransaction>
{
  private readonly storage = new AsyncLocalStorage<TTransaction>();

  /** Returns the transaction associated with the current asynchronous execution. */
  current(): TTransaction | undefined {
    return this.storage.getStore();
  }

  /** Runs work in an isolated asynchronous transaction context. */
  run<T>(transaction: TTransaction, work: () => Promise<T>): Promise<T> {
    return this.storage.run(transaction, work);
  }
}

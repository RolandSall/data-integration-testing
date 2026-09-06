import { expect, test } from 'vitest';
import { AsyncTransactionContext } from './transaction-context.js';

test(
  'given an active transaction, when asynchronous work reads the context, then the same transaction is available',
  async () => {
    const context = new AsyncTransactionContext<{ readonly id: string }>();

    const transaction = await context.run({ id: 'record-test' }, async () => {
      await Promise.resolve();
      return context.current();
    });

    expect(transaction).toEqual({ id: 'record-test' });
    expect(context.current()).toBeUndefined();
  },
);

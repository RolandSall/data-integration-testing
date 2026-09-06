import { expect, test } from 'vitest';
import { PrismaTransactionAdapter } from './prisma-transaction-adapter.js';

interface FakeTransaction {
  readonly writes: string[];
}

class FakePrismaClient {
  committed: readonly string[] = [];
  rolledBack = false;
  options: { readonly maxWait: number; readonly timeout: number } | undefined;

  async $transaction<T>(
    work: (transaction: FakeTransaction) => Promise<T>,
    options?: { readonly maxWait: number; readonly timeout: number },
  ): Promise<T> {
    this.options = options;
    const writes: string[] = [];
    try {
      const result = await work({ writes });
      this.committed = writes;
      return result;
    } catch (error) {
      this.rolledBack = true;
      throw error;
    }
  }
}

test(
  'given successful test work, when a Prisma transaction completes, then its writes are rolled back',
  async () => {
    const client = new FakePrismaClient();
    const adapter = new PrismaTransactionAdapter<FakePrismaClient, FakeTransaction>();

    const result = await adapter.rollbackOnly(client, (transaction) => {
      transaction.writes.push('record');
      return Promise.resolve('assertions completed');
    });

    expect(result).toBe('assertions completed');
    expect(client.rolledBack).toBe(true);
    expect(client.committed).toEqual([]);
    expect(client.options).toEqual({ maxWait: 10_000, timeout: 30_000 });
  },
);

test(
  'given failing test work, when a Prisma transaction rolls back, then the original failure is preserved',
  async () => {
    const client = new FakePrismaClient();
    const adapter = new PrismaTransactionAdapter<FakePrismaClient, FakeTransaction>();
    const failure = new Error('assertion failed');

    await expect(
      adapter.rollbackOnly(client, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(client.rolledBack).toBe(true);
  },
);

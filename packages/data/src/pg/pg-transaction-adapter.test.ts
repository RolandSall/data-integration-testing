import type { Pool, PoolClient } from 'pg';
import { expect, test, vi } from 'vitest';
import { PgTransactionAdapter } from './pg-transaction-adapter.js';

function fixture() {
  const query = vi.fn<(sql: string) => Promise<{ rows: never[] }>>().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, client, query, release, adapter: new PgTransactionAdapter() };
}

test('given successful work, when the transaction ends, then writes roll back before releasing its connection', async () => {
  const { pool, client, query, release, adapter } = fixture();
  const result = await adapter.rollbackOnly(pool, async (transaction) => {
    expect(transaction).toBe(client);
    expect(release).not.toHaveBeenCalled();
    await transaction.query('INSERT');
    return 42;
  });
  expect(result).toBe(42);
  expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'INSERT', 'ROLLBACK']);
  expect(release).toHaveBeenCalledExactlyOnceWith(false);
});

test('given failed work, when rollback succeeds, then the original failure is preserved', async () => {
  const { pool, query, release, adapter } = fixture();
  const failure = new Error('assertion failed');
  await expect(adapter.rollbackOnly(pool, async () => { throw failure; })).rejects.toBe(failure);
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalledExactlyOnceWith(false);
});

test('given failed work and a broken connection, when rollback fails, then both failures are retained and the connection is discarded', async () => {
  const { pool, query, release, adapter } = fixture();
  const failure = new Error('assertion failed');
  const rollbackFailure = new Error('connection lost');
  query.mockImplementation(async (sql) => {
    if (sql === 'ROLLBACK') throw rollbackFailure;
    return { rows: [] };
  });
  await expect(adapter.rollbackOnly(pool, async () => { throw failure; }))
    .rejects.toMatchObject({ errors: [failure, rollbackFailure] });
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
});

test('given a connection cannot begin a transaction, when a test starts, then work is skipped and the connection is discarded', async () => {
  const { pool, query, release, adapter } = fixture();
  const failure = new Error('begin failed');
  query.mockRejectedValueOnce(failure);
  const work = vi.fn();
  await expect(adapter.rollbackOnly(pool, work)).rejects.toBe(failure);
  expect(work).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
});

test('given successful work, when rollback fails, then the rollback failure fails the test', async () => {
  const { pool, query, release, adapter } = fixture();
  const failure = new Error('rollback failed');
  query.mockImplementation(async (sql) => {
    if (sql === 'ROLLBACK') throw failure;
    return { rows: [] };
  });
  await expect(adapter.rollbackOnly(pool, async () => 42)).rejects.toBe(failure);
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
});

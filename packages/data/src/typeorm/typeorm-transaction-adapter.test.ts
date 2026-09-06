import type { DataSource, EntityManager } from 'typeorm';
import { expect, test, vi } from 'vitest';
import { TypeOrmTransactionAdapter } from './typeorm-transaction-adapter.js';

function fixture() {
  const manager = {} as EntityManager;
  const runner = {
    manager, isTransactionActive: false,
    connect: vi.fn(async () => {}),
    startTransaction: vi.fn(async () => { runner.isTransactionActive = true; }),
    rollbackTransaction: vi.fn(async () => { runner.isTransactionActive = false; }),
    release: vi.fn(async () => {}),
  };
  const source = { createQueryRunner: () => runner } as unknown as DataSource;
  return { manager, runner, source, adapter: new TypeOrmTransactionAdapter() };
}
test('given successful work, when it finishes, then the bound manager is rolled back and released', async () => {
  const { manager, runner, source, adapter } = fixture();
  expect(await adapter.rollbackOnly(source, async (transaction) => { expect(transaction).toBe(manager); return 42; })).toBe(42);
  expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
  expect(runner.release).toHaveBeenCalledOnce();
});
test('given failed work, when cleanup succeeds, then the original failure is preserved', async () => {
  const { source, adapter, runner } = fixture();
  const failure = new Error('work failure');
  await expect(adapter.rollbackOnly(source, async () => { throw failure; })).rejects.toBe(failure);
  expect(runner.release).toHaveBeenCalledOnce();
});
test('given work and rollback and release fail, when cleanup finishes, then all failures are retained', async () => {
  const { source, adapter, runner } = fixture();
  const work = new Error('work'); const rollback = new Error('rollback'); const release = new Error('release');
  runner.rollbackTransaction.mockRejectedValue(rollback); runner.release.mockRejectedValue(release);
  await expect(adapter.rollbackOnly(source, async () => { throw work; })).rejects.toMatchObject({ errors: [work, rollback, release] });
});
test('given connection acquisition fails, when setup stops, then release is attempted without rollback', async () => {
  const { source, adapter, runner } = fixture();
  const failure = new Error('connect'); runner.connect.mockRejectedValue(failure);
  const work = vi.fn();
  await expect(adapter.rollbackOnly(source, work)).rejects.toBe(failure);
  expect(work).not.toHaveBeenCalled(); expect(runner.rollbackTransaction).not.toHaveBeenCalled(); expect(runner.release).toHaveBeenCalledOnce();
});

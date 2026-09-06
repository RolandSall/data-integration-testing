import { AsyncLocalStorage } from 'node:async_hooks';
import { expect, test } from 'vitest';
import { createDataIntegrationTestContext } from '../create-data-integration-test-context.js';
import { openTransactionSession } from './transaction-session.js';

test('given separately invoked hooks, when a session closes, then context is invalidated and rollback occurs once', async () => {
  let rollbacks = 0;
  const manager = createDataIntegrationTestContext({
    getResources: () => 'resources', createDatabase: async () => 'database', createClient: async () => ({}),
    closeClient: async () => {}, dropDatabase: async () => {},
    logger: { info() {}, error() {} },
    transactions: { rollbackOnly: async (_client, work) => { try { return await work({ id: 'transaction' }); } finally { rollbacks++; } } },
  });
  await manager.beforeTestClass();
  const session = await openTransactionSession(manager, 'test');
  let lateAccess!: () => unknown;
  session.run(() => {
    expect(manager.getCurrentContext().client).toEqual({ id: 'transaction' });
    // Promise descendants retain ALS, but the lease must be invalid after finish.
    const captured = AsyncLocalStorage.snapshot();
    lateAccess = () => captured(() => manager.getCurrentContext());
  });
  await Promise.all([session.finish(), session.finish()]);
  expect(() => session.run(() => {})).toThrow('closed');
  expect(lateAccess).toThrow('only available');
  expect(rollbacks).toBe(1);
  await manager.afterTestClass();
});

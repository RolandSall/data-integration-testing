import { aroundAll, aroundEach, type RunnerTask } from 'vitest';
import type { DataIntegrationTestConfiguration } from '../data-integration-test-configuration.js';
import { DataIntegrationTestContextManager } from '../data-integration-test-context-manager.js';
import { consumeDeclaration } from '../internal/declarations.js';
import { openTransactionSession } from '../internal/transaction-session.js';
import type { VitestDataIntegrationTestSupportOptions } from './vitest-data-integration-test-support-options.js';

function validate(task: RunnerTask): void {
  if (task.concurrent) throw new Error('Concurrent tests are not supported in data integration files; use parallel files');
  if (task.type === 'suite') for (const child of task.tasks) validate(child);
}

/** Install once in setupFiles, with either shared context or the original configuration. */
export function installVitestDataIntegrationTestSupport<R, D, C, T>(
  configuration: DataIntegrationTestConfiguration<R, D, C, T> | DataIntegrationTestContextManager<R, D, C, T>,
  options: VitestDataIntegrationTestSupportOptions = {},
): DataIntegrationTestContextManager<R, D, C, T> {
  const manager = configuration instanceof DataIntegrationTestContextManager
    ? configuration : new DataIntegrationTestContextManager(configuration);
  const timeout = options.transactionLifecycleTimeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('transactionLifecycleTimeoutMs must be positive');
  let active = false;
  const infrastructureFailures: unknown[] = [];
  // Vitest requires destructured fixture parameters, even when no fixtures are used.
  // eslint-disable-next-line no-empty-pattern
  aroundAll(async (runSuite, {}, suite) => {
    const declaration = consumeDeclaration();
    if (!declaration) { await runSuite(); return; }
    validate(suite);
    options.validateTestClass?.(declaration);
    active = true;
    let failure: { error: unknown } | undefined;
    try {
      await manager.beforeTestClass();
      await runSuite();
    } catch (error) { failure = { error }; }
    try { await manager.afterTestClass(); } catch (error) { infrastructureFailures.push(error); }
    active = false;
    if (infrastructureFailures.length) {
      throw new AggregateError([...(failure ? [failure.error] : []), ...infrastructureFailures], 'Data integration infrastructure failed');
    }
    if (failure) throw failure.error;
  });
  aroundEach(async (runTest, { task }) => {
    if (!active) { await runTest(); return; }
    let session;
    try { session = await openTransactionSession(manager, task.name, timeout); }
    catch (error) { infrastructureFailures.push(error); throw error; }
    let failure: { error: unknown } | undefined;
    try { await session.run(runTest); } catch (error) { failure = { error }; }
    try { await session.finish(); }
    catch (error) {
      infrastructureFailures.push(error);
      if (failure) throw new AggregateError([failure.error, error], 'Test and transaction cleanup failed');
      throw error;
    }
    if (failure) throw failure.error;
  });
  return manager;
}

import type { DataIntegrationTestContextManager } from '../data-integration-test-context-manager.js';
import { consumeDeclaration } from '../internal/declarations.js';
import { openTransactionSession } from '../internal/transaction-session.js';
import { BRIDGE_KEY, type JestDataGlobal } from './bridge.js';

export interface JestDataIntegrationTestSupportOptions {
  /** Bound transaction acquisition and rollback independently of test duration. Default: 10000. */
  readonly transactionLifecycleTimeoutMs?: number;
}
/** Install once in setupFilesAfterEnv with the package's Node test environment. */
export function installJestDataIntegrationTestSupport<R, D, C, T>(
  context: DataIntegrationTestContextManager<R, D, C, T>,
  options: JestDataIntegrationTestSupportOptions = {},
): DataIntegrationTestContextManager<R, D, C, T> {
  const sandbox = globalThis as typeof globalThis & JestDataGlobal;
  if (!sandbox.__integration_testing_data_environment__) {
    throw new Error('Configure testEnvironment: "@integration-testing/data-isolation/jest/environment" before installing data support');
  }
  if (sandbox[BRIDGE_KEY]) throw new Error('Install data integration support only once per test file');
  const timeout = options.transactionLifecycleTimeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('transactionLifecycleTimeoutMs must be positive');
  sandbox[BRIDGE_KEY] = {
    activate: () => consumeDeclaration() !== undefined,
    setup: () => context.beforeTestClass(),
    begin: (name) => openTransactionSession(context, name, timeout),
    teardown: () => context.afterTestClass(),
  };
  return context;
}

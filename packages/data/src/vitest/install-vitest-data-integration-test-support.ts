import { afterAll, aroundEach, beforeAll } from 'vitest';
import type { DataIntegrationTestConfiguration } from '../data-integration-test-configuration.js';
import type { DataIntegrationTestContextAccessor } from '../data-integration-test-context-accessor.js';
import { DataIntegrationTestContextManager } from '../data-integration-test-context-manager.js';
import { consumeDataIntegrationTestClasses } from '../data-integration-test.js';
import type { VitestDataIntegrationTestSupportOptions } from './vitest-data-integration-test-support-options.js';

/**
 * Installs data integration-test lifecycle hooks for every decorated class in one Vitest file.
 *
 * Call this once from a module configured through Vitest `setupFiles`. Test modules only need
 * `@DataIntegrationTest`; they do not register lifecycle hooks themselves. The returned
 * accessor may be exported from the setup module for strongly typed test access.
 *
 * Files without `@DataIntegrationTest` continue normally without creating a database client.
 * Exactly one decorated class is allowed per test file because Vitest functions are not
 * members of that marker class.
 *
 * @example
 * ```ts
 * // vitest.data-integration.setup.ts
 * export const recordDataTestContext =
 *   installVitestDataIntegrationTestSupport(configuration);
 * ```
 */
export const installVitestDataIntegrationTestSupport = <
  TResources,
  TDatabase,
  TRootClient,
  TTransactionClient,
>(
  configuration: DataIntegrationTestConfiguration<
    TResources,
    TDatabase,
    TRootClient,
    TTransactionClient
  >,
  options: VitestDataIntegrationTestSupportOptions = {},
): DataIntegrationTestContextAccessor<TResources, TDatabase, TTransactionClient> => {
  const contextManager = new DataIntegrationTestContextManager(configuration);
  let active = false;

  beforeAll(async () => {
    const testClasses = consumeDataIntegrationTestClasses();
    if (testClasses.length === 0) {
      return;
    }
    if (testClasses.length > 1) {
      throw new Error(
        `Expected one @DataIntegrationTest class in the test file, found ${testClasses.length}`,
      );
    }

    const testClass = testClasses.at(0);
    if (testClass === undefined) {
      throw new Error('Data integration-test class discovery returned no class');
    }
    options.validateTestClass?.(testClass);
    active = true;
    await contextManager.beforeTestClass();
  });

  aroundEach(async (runTest, context) => {
    if (active) {
      await contextManager.executeTestMethod(context.task.name, runTest);
      return;
    }
    await runTest();
  });

  afterAll(async () => {
    if (!active) {
      return;
    }
    try {
      await contextManager.afterTestClass();
    } finally {
      active = false;
    }
  });

  return contextManager;
};

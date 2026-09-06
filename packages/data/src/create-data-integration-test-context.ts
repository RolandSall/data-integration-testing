import type { DataIntegrationTestConfiguration } from './data-integration-test-configuration.js';
import { DataIntegrationTestContextManager } from './data-integration-test-context-manager.js';

/** Creates a shared, runner-independent context to install in Jest or Vitest. */
export function createDataIntegrationTestContext<R, D, C, T>(
  configuration: DataIntegrationTestConfiguration<R, D, C, T>,
): DataIntegrationTestContextManager<R, D, C, T> {
  return new DataIntegrationTestContextManager(configuration);
}

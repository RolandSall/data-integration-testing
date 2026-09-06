import type { DataIntegrationTestClass } from '../data-integration-test.js';

/** Optional application-specific validation performed for a decorated Vitest test class. */
export interface VitestDataIntegrationTestSupportOptions {
  /** Maximum acquisition/rollback duration in milliseconds. Default: 10000. */
  readonly transactionLifecycleTimeoutMs?: number;
  /** Validates the decorated class before database setup begins. */
  validateTestClass?(testClass: DataIntegrationTestClass): void;
}

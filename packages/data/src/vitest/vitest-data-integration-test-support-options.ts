import type { DataIntegrationTestClass } from '../data-integration-test.js';

/** Optional application-specific validation performed for a decorated Vitest test class. */
export interface VitestDataIntegrationTestSupportOptions {
  /** Validates the decorated class before database setup begins. */
  validateTestClass?(testClass: DataIntegrationTestClass): void;
}

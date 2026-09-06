import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { setupFiles: ['./src/vitest/vitest-data-integration-test.setup.test-helper.ts'] } });

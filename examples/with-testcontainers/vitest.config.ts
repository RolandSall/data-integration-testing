import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['test/**/*.container.integration.test.ts'],
  globalSetup: ['./test/containers.global-setup.ts'],
  setupFiles: ['./test/data.setup.ts'],
  hookTimeout: 360_000,
  testTimeout: 30_000,
} });

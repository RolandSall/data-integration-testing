import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  globals: true,
  include: [process.env.FAILURE_MODE ? 'test/failure.test.ts' : process.env.BASELINE ? 'test/baseline.test.ts' : 'test/*.integration.test.ts'],
  setupFiles: process.env.BASELINE ? [] : ['test/vitest.setup.ts'],
  maxWorkers: 2,
  fileParallelism: process.env.DATA_CLIENT !== 'sqlite',
  hookTimeout: 30000,
  testTimeout: 30000,
} });

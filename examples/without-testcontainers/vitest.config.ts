import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['test/**/*.test.ts'],
  setupFiles: ['./test/data.setup.ts'],
  hookTimeout: 30_000,
} });

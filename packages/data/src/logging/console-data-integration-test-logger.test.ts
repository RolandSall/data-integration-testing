import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConsoleDataIntegrationTestLogger } from './console-data-integration-test-logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleDataIntegrationTestLogger', () => {
  test(
    'given a fixed clock, when a database event is logged, then its line starts with an ISO timestamp and scope',
    () => {
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new ConsoleDataIntegrationTestLogger(
        () => new Date('2026-08-23T00:38:13.123Z'),
      );

      logger.info('database', 'Prisma connection established');

      expect(write).toHaveBeenCalledWith(
        '[2026-08-23T00:38:13.123Z] [integration:database] Prisma connection established\n',
      );
    },
  );
});

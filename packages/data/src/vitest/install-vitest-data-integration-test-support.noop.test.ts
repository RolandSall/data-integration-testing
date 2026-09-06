import { expect, test } from 'vitest';
import { lifecycleEvents } from './vitest-data-integration-test.setup.test-helper.js';

test(
  'given a test file without the data annotation, when installed support runs, then database setup remains inactive',
  () => {
    expect(lifecycleEvents).toEqual([]);
  },
);

import { expect, test } from 'vitest';
import {
  consumeDataIntegrationTestClasses,
  DataIntegrationTest,
  isDataIntegrationTest,
} from './data-integration-test.js';

test(
  'given a decorated class, when its data-test metadata is read, then it is identified as a data integration test',
  () => {
    @DataIntegrationTest
    class RecordPersistenceIntegrationTest {}

    expect(isDataIntegrationTest(RecordPersistenceIntegrationTest)).toBe(true);
    expect(consumeDataIntegrationTestClasses()).toEqual([
      RecordPersistenceIntegrationTest,
    ]);
    expect(consumeDataIntegrationTestClasses()).toEqual([]);
  },
);

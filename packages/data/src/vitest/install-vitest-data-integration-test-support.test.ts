import { beforeEach, expect, expectTypeOf, test } from 'vitest';
import { DataIntegrationTest } from '../data-integration-test.js';
import {
  type FakeClient,
  testDataIntegrationTestContext,
} from './vitest-data-integration-test.setup.test-helper.js';

@DataIntegrationTest
export class RecordDataIntegrationTest {}

let clientFromBeforeEach: FakeClient;

beforeEach(() => {
  clientFromBeforeEach = testDataIntegrationTestContext.getCurrentContext().client;
});

test(
  'given an annotated data test, when common setup accesses its context, then the test receives the typed transaction client',
  () => {
    const { client } = testDataIntegrationTestContext.getCurrentContext();
    expectTypeOf(client).toEqualTypeOf<FakeClient>();
    expect(clientFromBeforeEach).toBe(client);

    clientFromBeforeEach.records.push('record');

    expect(client.records).toEqual(['record']);
  },
);

test(
  'given a previous test wrote data, when the next transaction starts, then the previous write is absent',
  () => {
    expect(testDataIntegrationTestContext.getCurrentContext().client.records).toEqual([]);
  },
);

import { DataIntegrationTest } from '@integration-testing/data-isolation';
import { beforeEach, expect, test } from 'vitest';
import { dataContext } from './data.setup.js';

@DataIntegrationTest
export class NotesDataIntegrationTest {}

beforeEach(async () => {
  await dataContext.getCurrentContext().client.note.create({ data: { id: 'fixture', body: 'hello' } });
});

test('given a note, when it is queried through Prisma, then its body is returned', async () => {
  const note = await dataContext.getCurrentContext().client.note.findUniqueOrThrow({ where: { id: 'fixture' } });
  expect(note.body).toBe('hello');
});

test('given a note, when it is updated through Prisma, then the new body is visible in this transaction', async () => {
  const note = await dataContext.getCurrentContext().client.note.update({
    where: { id: 'fixture' }, data: { body: 'updated' },
  });
  expect(note.body).toBe('updated');
});

test.fails('given a test writes a note, when its assertion fails, then teardown still rolls back the fixture', () => {
  expect('deliberate assertion failure').toBe('success');
});

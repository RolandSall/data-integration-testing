import { DataIntegrationTest } from '@integration-testing/data-isolation';
import { Container, RequiredContainer } from '@integration-testing/testcontainers';
import { beforeEach, expect, test } from 'vitest';
import { dataContext } from './data.setup.js';

@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'shared' } })
@DataIntegrationTest
export class NotesDataIntegrationTest {}

beforeEach(async () => {
  await dataContext.getCurrentContext().client.query(
    'INSERT INTO notes (id, body) VALUES ($1, $2)', ['fixture', 'hello'],
  );
});

test('given a note, when it is queried, then its body is returned', async () => {
  const result = await dataContext.getCurrentContext().client.query<{ body: string }>(
    'SELECT body FROM notes WHERE id = $1', ['fixture'],
  );
  expect(result.rows).toEqual([{ body: 'hello' }]);
});

test('given a note, when it is updated, then the new body is visible in this transaction', async () => {
  const client = dataContext.getCurrentContext().client;
  await client.query('UPDATE notes SET body = $1 WHERE id = $2', ['updated', 'fixture']);
  const result = await client.query<{ body: string }>('SELECT body FROM notes WHERE id = $1', ['fixture']);
  expect(result.rows).toEqual([{ body: 'updated' }]);
});

test.fails('given a test writes a note, when its assertion fails, then teardown still rolls back the fixture', () => {
  expect('deliberate assertion failure').toBe('success');
});

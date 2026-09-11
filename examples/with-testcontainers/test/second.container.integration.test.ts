import { DataIntegrationTest } from '@integration-testing/data-isolation';
import { Container, RequiredContainer } from '@integration-testing/testcontainers';
import { expect, test } from 'vitest';
import { dataContext } from './data.setup.js';

@RequiredContainer({ database: { kind: Container.PostgreSql, isolation: 'shared' } })
@DataIntegrationTest
export class SecondNotesIntegrationTest {}

test('given globally prepared schema, when a second file runs in parallel, then it can write without creating tables', async () => {
  const client = dataContext.getCurrentContext().client;
  await client.query('INSERT INTO notes (id, body) VALUES ($1, $2)', ['parallel-file', 'independent fixture']);
  const result = await client.query<{ body: string }>('SELECT body FROM notes WHERE id = $1', ['parallel-file']);
  expect(result.rows).toEqual([{ body: 'independent fixture' }]);
});

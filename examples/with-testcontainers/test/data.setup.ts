import { Pool } from 'pg';
import { Container } from '@integration-testing/testcontainers';
import { injectedContainerResources } from '@integration-testing/testcontainers/vitest';
import { PgTransactionAdapter } from '@integration-testing/data/pg';
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data/vitest';

export const dataContext = installVitestDataIntegrationTestSupport({
  getResources: () => injectedContainerResources().get(Container.PostgreSql),
  createDatabase: async (resource) => resource.connectionUri,
  createClient: async (connectionString) => new Pool({ connectionString }),
  prepareDatabase: async (pool) => {
    await pool.query('CREATE TABLE notes (id text PRIMARY KEY, body text NOT NULL)');
  },
  closeClient: async (pool) => {
    // Assert from the root connection that test writes never committed.
    try {
      const result = await pool.query<{ count: string }>('SELECT count(*) FROM notes');
      if (result.rows[0]?.count !== '0') throw new Error('Test writes escaped rollback');
    } finally {
      await pool.end();
    }
  },
  // The container package owns and removes this disposable database.
  dropDatabase: async () => {},
  transactions: new PgTransactionAdapter(),
});

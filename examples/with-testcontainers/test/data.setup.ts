import { Pool } from 'pg';
import { Container, ContainerResources } from '@integration-testing/testcontainers';
import { inject } from 'vitest';
import { CONTAINER_RESOURCES_CONTEXT_KEY } from '@integration-testing/testcontainers/vitest';
import { PgTransactionAdapter } from '@integration-testing/data-isolation/pg';
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data-isolation/vitest';

export const dataContext = installVitestDataIntegrationTestSupport({
  getResources: () => ContainerResources.fromSerializable(inject(CONTAINER_RESOURCES_CONTEXT_KEY))
    .getNamed('database', Container.PostgreSql),
  createDatabase: async (resource) => resource.connectionUri,
  createClient: async (connectionString) => new Pool({ connectionString }),
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

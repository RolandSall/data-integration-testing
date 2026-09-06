import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Container, createDefaultContainerRegistry } from '@integration-testing/testcontainers';
import { createVitestContainerGlobalSetup } from '@integration-testing/testcontainers/vitest';

// These APIs are available in the published 0.1.0-beta.0 release.
const lifecycle = createVitestContainerGlobalSetup({
  root: new URL('..', import.meta.url).pathname,
  registry: createDefaultContainerRegistry(),
  // Schema setup is global, before workers. Per-file setup must not race on shared DDL.
  prepareResources: async (resources) => {
    const pool = new Pool({ connectionString: resources.get(Container.PostgreSql).connectionUri });
    try { await pool.query(await readFile(new URL('../migrations/001-notes.sql', import.meta.url), 'utf8')); }
    finally { await pool.end(); }
    return undefined;
  },
});
export const setup = lifecycle.setup;
export const teardown = lifecycle.teardown;

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient, type Prisma } from '../generated/client/index.js';
import { PrismaTransactionAdapter } from '@integration-testing/data-isolation/prisma';
import { installVitestDataIntegrationTestSupport } from '@integration-testing/data-isolation/vitest';

export const dataContext = installVitestDataIntegrationTestSupport({
  getResources: () => tmpdir(),
  createDatabase: async (directory) => {
    const ownedDirectory = await mkdtemp(join(directory, 'data-integration-'));
    return { ownedDirectory, url: `file:${join(ownedDirectory, 'test.db')}` };
  },
  createClient: async (database) => new PrismaClient({ datasourceUrl: database.url }),
  prepareDatabase: async (client) => {
    await client.$executeRawUnsafe('CREATE TABLE Note (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL)');
  },
  closeClient: async (client) => {
    try {
      if (await client.note.count() !== 0) throw new Error('Test writes escaped rollback');
    } finally {
      await client.$disconnect();
    }
  },
  dropDatabase: async (_resources, database) => {
    await rm(database.ownedDirectory, { recursive: true, force: true });
  },
  transactions: new PrismaTransactionAdapter<PrismaClient, Prisma.TransactionClient>(),
});

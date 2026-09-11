import 'reflect-metadata';
import { migrateSqlite } from '../src/migrate.js';
import { DataSource } from 'typeorm';
import { PrismaClient as PgPrisma, type Prisma } from '../generated/postgresql/index.js';
import { PrismaClient as SqlitePrisma, type Prisma as SqlitePrismaTypes } from '../generated/sqlite/index.js';
import { createDataIntegrationTestContext } from '@integration-testing/data-isolation';
import { PgTransactionAdapter } from '@integration-testing/data-isolation/pg';
import { PrismaTransactionAdapter } from '@integration-testing/data-isolation/prisma';
import { TypeOrmTransactionAdapter } from '@integration-testing/data-isolation/typeorm';
import { ProductEntity, ReservationEntity } from '../src/typeorm-repository.js';
import { createDatabase, dropDatabase, poolFor, migratePostgres, assertPostgresEmpty } from './database.js';

export const clientKind = process.env.DATA_CLIENT ?? 'pg';
const postgresBase = {
  getResources: () => 'postgres',
  createDatabase: async () => createDatabase(),
  dropDatabase: async (_resources: string, database: Awaited<ReturnType<typeof createDatabase>>) => { try { await verifyEmpty(database); console.log("DATABASE_CLEAN"); } finally { await dropDatabase(database); } },
};
export const pgContext = createDataIntegrationTestContext({
  ...postgresBase,
  createClient: async (database) => poolFor(database),
  prepareDatabase: async (_pool, database) => migratePostgres(database),
  closeClient: async (pool) => { await pool.end(); },
  transactions: new PgTransactionAdapter(),
});
export const typeormContext = createDataIntegrationTestContext({
  ...postgresBase,
  createClient: async (database) => new DataSource({ type: 'postgres', url: database.url, schema: database.schema, entities: [ProductEntity, ReservationEntity], synchronize: false }).initialize(),
  prepareDatabase: async (_source, database) => migratePostgres(database),
  closeClient: async (source) => { await source.destroy(); },
  transactions: new TypeOrmTransactionAdapter(),
});
export const prismaContext = createDataIntegrationTestContext({
  ...postgresBase,
  createClient: async (database) => {
    const url = new URL(database.url); url.searchParams.set('schema', database.schema);
    return new PgPrisma({ datasourceUrl: url.toString() });
  },
  prepareDatabase: async (_client, database) => migratePostgres(database),
  closeClient: async (client) => { await client.$disconnect(); },
  transactions: new PrismaTransactionAdapter<PgPrisma, Prisma.TransactionClient>(),
});
export const sqliteContext = createDataIntegrationTestContext({
  getResources: () => 'sqlite',
  createDatabase: async () => createDatabase(true),
  createClient: async (database) => new SqlitePrisma({ datasourceUrl: database.url }),
  prepareDatabase: async (_client, database) => {
    if (database.shared) return;
    await migrateSqlite(database.url);
  },
  closeClient: async (client) => { await client.$disconnect(); },
  dropDatabase: async (_resources, database) => { try { await verifyEmpty(database); console.log("DATABASE_CLEAN"); } finally { await dropDatabase(database); } },
  transactions: new PrismaTransactionAdapter<SqlitePrisma, SqlitePrismaTypes.TransactionClient>(),
});

export function currentClient(): unknown {
  switch (clientKind) {
    case 'typeorm': return typeormContext.getCurrentContext().client;
    case 'prisma': return prismaContext.getCurrentContext().client;
    case 'sqlite': return sqliteContext.getCurrentContext().client;
    default: return pgContext.getCurrentContext().client;
  }
}
// Called outside transactions by tests to verify committed state independently.
export async function verifyEmpty(database: Awaited<ReturnType<typeof createDatabase>>): Promise<void> {
  if (database.url.startsWith('file:')) {
    const root = new SqlitePrisma({ datasourceUrl: database.url });
    try { if (await root.product.count() || await root.reservation.count()) throw new Error('Test writes escaped rollback'); }
    finally { await root.$disconnect(); }
  } else await assertPostgresEmpty(database);
}

export async function terminateTransactionConnection(): Promise<void> {
  const sql = 'SELECT pg_terminate_backend(pg_backend_pid())';
  if (clientKind === 'pg') await pgContext.getCurrentContext().client.query(sql);
  else if (clientKind === 'typeorm') await typeormContext.getCurrentContext().client.query(sql);
  else if (clientKind === 'prisma') await prismaContext.getCurrentContext().client.$queryRawUnsafe(sql);
  else throw new Error('Connection termination requires PostgreSQL');
}

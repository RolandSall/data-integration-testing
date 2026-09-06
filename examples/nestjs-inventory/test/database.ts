import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { migratePostgresUrl } from '../src/migrate.ts';

export interface Database { url: string; schema: string; directory?: string; shared?: boolean }
export async function createDatabase(sqlite = false): Promise<Database> {
  if (sqlite && process.env.DATA_SQLITE_URL) return { url: process.env.DATA_SQLITE_URL, schema: '', shared: true };
  if (sqlite) {
    const directory = await mkdtemp(join(tmpdir(), 'inventory-test-'));
    return { url: `file:${join(directory, 'test.db')}`, schema: '', directory };
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must point to a disposable test database');
  if (process.env.DATA_SCHEMA) return { url, schema: process.env.DATA_SCHEMA, shared: true };
  const schema = `inventory_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: url });
  try { await pool.query(`CREATE SCHEMA "${schema}"`); } finally { await pool.end(); }
  return { url, schema };
}
export function poolFor(database: Database): Pool {
  return new Pool({ connectionString: database.url, options: `-c search_path=${database.schema}` });
}
export async function migratePostgres(database: Database): Promise<void> {
  if (database.shared) return;
  await migratePostgresUrl(database.url, database.schema);
}
export async function dropDatabase(database: Database): Promise<void> {
  if (database.shared) return;
  if (database.directory) { await rm(database.directory, { recursive: true, force: true }); return; }
  const pool = new Pool({ connectionString: database.url });
  try { await pool.query(`DROP SCHEMA "${database.schema}" CASCADE`); } finally { await pool.end(); }
}
export async function assertPostgresEmpty(database: Database): Promise<void> {
  const pool = poolFor(database);
  try {
    const result = await pool.query<{ products: string; reservations: string }>('SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM reservations) AS reservations');
    if (result.rows[0]?.products !== '0' || result.rows[0].reservations !== '0') throw new Error('Test writes escaped rollback');
  } finally { await pool.end(); }
}

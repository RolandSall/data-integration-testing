import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/sqlite/index.js';

const migrationId = '001-inventory';
const migrationSql = () => readFile(resolve('migrations/001-inventory.sql'), 'utf8');

// Application migrations are the schema authority. Test setup calls this same entrypoint.
export async function migratePostgresUrl(url: string, schema = 'public'): Promise<void> {
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':inventory-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS application_migrations (id text PRIMARY KEY)');
    const applied = await client.query('SELECT id FROM application_migrations WHERE id = $1', [migrationId]);
    if (!applied.rowCount) {
      await client.query(await migrationSql());
      await client.query('INSERT INTO application_migrations (id) VALUES ($1)', [migrationId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await pool.end(); }
}
export async function migrateSqlite(url: string): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS application_migrations (id text PRIMARY KEY)');
      const applied = await transaction.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM application_migrations WHERE id = ?', migrationId);
      if (!applied.length) {
        for (const statement of (await migrationSql()).split(';').filter((part) => part.trim())) await transaction.$executeRawUnsafe(statement);
        await transaction.$executeRawUnsafe('INSERT INTO application_migrations (id) VALUES (?)', migrationId);
      }
    });
  } finally { await client.$disconnect(); }
}

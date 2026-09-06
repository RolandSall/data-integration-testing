import 'reflect-metadata';
import type { Pool, PoolClient } from 'pg';
import { createDatabase, dropDatabase, poolFor, migratePostgres, assertPostgresEmpty, type Database } from './database.js';
import { inventoryScenarios } from './scenarios.js';

// Deliberately uses neither the data library nor its adapters.
let database: Database;
let pool: Pool;
let transaction: PoolClient;
beforeAll(async () => {
  database = await createDatabase();
  pool = poolFor(database);
  await migratePostgres(database);
});
beforeEach(async () => {
  transaction = await pool.connect();
  await transaction.query('BEGIN');
});
// Group application hooks inside the transaction lifecycle for both runners.
describe('handwritten transaction lifecycle', () => { inventoryScenarios(() => transaction, 'pg'); });
afterEach(async () => {
  try { await transaction.query('ROLLBACK'); } finally { transaction.release(); }
});
afterAll(async () => {
  try { await assertPostgresEmpty(database); }
  finally { try { await pool.end(); } finally { await dropDatabase(database); } }
});

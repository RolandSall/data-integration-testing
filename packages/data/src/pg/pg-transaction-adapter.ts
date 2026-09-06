import type { Pool, PoolClient } from 'pg';
import type { TransactionAdapter } from '../transaction/transaction-adapter.js';

/** Uses one leased PostgreSQL connection per test, rolling back before release. */
export class PgTransactionAdapter implements TransactionAdapter<Pool, PoolClient> {
  async rollbackOnly<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    let destroy = false;
    try {
      try {
        await client.query('BEGIN');
      } catch (error) {
        destroy = true;
        throw error;
      }
      let outcome: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await work(client) };
      } catch (error) {
        outcome = { ok: false, error };
      }
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroy = true;
        if (!outcome.ok) {
          throw new AggregateError([outcome.error, rollbackError], 'Test and PostgreSQL rollback failed');
        }
        throw rollbackError;
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    } finally {
      client.release(destroy);
    }
  }
}

import type { Pool, PoolClient } from 'pg';
import type { TransactionAdapter } from '../transaction/transaction-adapter.js';

/** Uses one leased PostgreSQL connection per test, rolling back before release. */
export class PgTransactionAdapter implements TransactionAdapter<Pool, PoolClient> {
  async rollbackOnly<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    const failures: unknown[] = [];
    let started = false;
    let destroy = false;
    let result: { value: T } | undefined;
    const onConnectionError = (error: Error): void => { destroy = true; failures.push(error); };
    client.on('error', onConnectionError);
    try {
      await client.query('BEGIN');
      started = true;
      result = { value: await work(client) };
    } catch (error) { failures.push(error); destroy ||= !started; }
    if (started) {
      try { await client.query('ROLLBACK'); }
      catch (error) { failures.push(error); destroy = true; }
    }
    try { client.release(destroy); } catch (error) { failures.push(error); }
    client.removeListener('error', onConnectionError);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Test and PostgreSQL cleanup failed');
    if (!result) throw new Error('PostgreSQL transaction returned no result');
    return result.value;
  }
}

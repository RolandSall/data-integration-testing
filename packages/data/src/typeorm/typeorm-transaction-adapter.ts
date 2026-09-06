import type { DataSource, EntityManager } from 'typeorm';
import type { TransactionAdapter } from '../transaction/transaction-adapter.js';

/** One dedicated connection and transaction-bound EntityManager per test. */
export class TypeOrmTransactionAdapter implements TransactionAdapter<DataSource, EntityManager> {
  async rollbackOnly<T>(source: DataSource, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const runner = source.createQueryRunner();
    const failures: unknown[] = [];
    let result: { value: T } | undefined;
    try {
      await runner.connect();
      await runner.startTransaction();
      result = { value: await work(runner.manager) };
    } catch (error) { failures.push(error); }
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } catch (error) { failures.push(error); }
    try { await runner.release(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'TypeORM test transaction and cleanup failed');
    if (!result) throw new Error('TypeORM transaction returned no result');
    return result.value;
  }
}

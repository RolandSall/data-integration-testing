import type { TransactionAdapter } from '../index.js';

const ROLLBACK_SIGNAL = new Error('prisma-data-integration-testing rollback');

/** Prisma interactive-transaction timing options used by rollback-only tests. */
export interface PrismaTransactionOptions {
  /** Maximum time Prisma waits to acquire a transaction. */
  readonly maxWait: number;
  /** Maximum time allowed for the interactive transaction callback. */
  readonly timeout: number;
}

/** Minimal Prisma client contract required by `PrismaTransactionAdapter`. */
export interface PrismaInteractiveTransactionClient<TTransactionClient> {
  /** Executes work in an interactive Prisma transaction. */
  $transaction<T>(
    work: (transaction: TTransactionClient) => Promise<T>,
    options?: PrismaTransactionOptions,
  ): Promise<T>;
}

/**
 * Prisma implementation of rollback-only test transactions.
 *
 * Successful work is followed by a private error that makes Prisma roll back. Only that
 * private signal is swallowed. Test and database errors are rethrown unchanged.
 */
export class PrismaTransactionAdapter<
  TRootClient extends PrismaInteractiveTransactionClient<TTransactionClient>,
  TTransactionClient,
> implements TransactionAdapter<TRootClient, TTransactionClient>
{
  /** Creates an adapter with optional Prisma transaction timing overrides. */
  constructor(
    private readonly options: PrismaTransactionOptions = {
      maxWait: 10_000,
      timeout: 30_000,
    },
  ) {}

  /** Runs work with Prisma's transaction client and guarantees rollback. */
  async rollbackOnly<T>(
    client: TRootClient,
    work: (transaction: TTransactionClient) => Promise<T>,
  ): Promise<T> {
    const outcome: { completed?: { readonly value: T } } = {};

    try {
      await client.$transaction(
        async (transaction) => {
          outcome.completed = { value: await work(transaction) };
          throw ROLLBACK_SIGNAL;
        },
        this.options,
      );
    } catch (error) {
      if (error !== ROLLBACK_SIGNAL) {
        throw error;
      }
    }

    if (outcome.completed === undefined) {
      throw new Error('Prisma rollback transaction completed without a test result');
    }
    return outcome.completed.value;
  }
}

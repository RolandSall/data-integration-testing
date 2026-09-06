import { AsyncLocalStorage } from 'node:async_hooks';

interface SessionManager {
  executeTestMethod<T>(name: string, work: () => Promise<T>): Promise<T>;
  invalidateCurrentContext(): void;
}
export interface TransactionSession {
  run<T>(work: () => T): T;
  finish(): Promise<void>;
}

function bounded<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(message)); }, milliseconds);
    work.then(resolve, reject).finally(() => { clearTimeout(timer); }).catch(() => {});
  });
}

/** Holds callback-style transactions open across separately invoked runner hooks. */
export async function openTransactionSession(
  manager: SessionManager, name: string, timeoutMs = 10_000,
): Promise<TransactionSession> {
  let closed = false;
  let finishPromise: Promise<void> | undefined;
  let release!: () => void;
  const completed = new Promise<void>((resolve) => { release = resolve; });
  let ready!: (run: ReturnType<typeof AsyncLocalStorage.snapshot>) => void;
  const started = new Promise<ReturnType<typeof AsyncLocalStorage.snapshot>>((resolve) => { ready = resolve; });
  const operation = manager.executeTestMethod(name, async () => {
    if (closed) return;
    ready(AsyncLocalStorage.snapshot());
    await completed;
  });
  // Observe early/late acquisition errors even if a lifecycle timeout has already fired.
  const premature = operation.then(() => { throw new Error('Transaction ended before session acquisition'); });
  premature.catch(() => {});
  let scope: ReturnType<typeof AsyncLocalStorage.snapshot>;
  try {
    scope = await bounded(Promise.race([started, premature]), timeoutMs, 'Transaction acquisition timed out');
  } catch (error) {
    closed = true;
    release();
    throw error;
  }
  return {
    run: (work) => {
      if (closed) throw new Error('Data integration transaction is closed');
      return scope(work);
    },
    finish: () => {
      if (!finishPromise) {
        closed = true;
        scope(() => { manager.invalidateCurrentContext(); });
        release();
        finishPromise = bounded(operation, timeoutMs, 'Transaction rollback timed out');
      }
      return finishPromise;
    },
  };
}

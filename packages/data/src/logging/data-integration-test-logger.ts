/** Receives database setup, transaction, and cleanup events. */
export interface DataIntegrationTestLogger {
  /** Records an informational lifecycle event. */
  info(scope: string, message: string): void;
  /** Records a failed lifecycle event and its optional cause. */
  error(scope: string, message: string, error?: unknown): void;
}

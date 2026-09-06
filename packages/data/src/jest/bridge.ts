import type { TransactionSession } from '../internal/transaction-session.js';
export const BRIDGE_KEY = '__integration_testing_data_jest__';
export interface JestDataBridge {
  activate(): boolean;
  setup(): Promise<void>;
  begin(name: string): Promise<TransactionSession>;
  teardown(): Promise<void>;
}
export interface JestDataGlobal {
  [BRIDGE_KEY]?: JestDataBridge;
  __integration_testing_data_environment__?: boolean;
}

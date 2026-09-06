import { declareDataIntegrationTest } from '@integration-testing/data';
import type { TestingModule } from '@nestjs/testing';
import { InventoryRepository, InventoryService } from '../src/inventory.js';
import { applicationFor } from './application.js';
import { currentClient, clientKind, terminateTransactionConnection } from './context.js';

declareDataIntegrationTest();
let app: TestingModule | undefined;
const mode = process.env.FAILURE_MODE;
beforeEach(async () => {
  app = await applicationFor(currentClient(), clientKind);
  await app.get(InventoryRepository).addProduct('book', 10);
  if (mode === 'fixture') throw new Error('deliberate fixture failure');
});
afterEach(async () => {
  if (app) await app.close();
  if (mode === 'teardown') throw new Error('deliberate teardown failure');
});
test('failed attempts leave no committed writes', async () => {
  if (!app) throw new Error('Application setup did not complete');
  await app.get(InventoryService).reserve('book', 3, 'failed-order');
  if (mode === 'connection') await terminateTransactionConnection();
  if (mode === 'timeout') await new Promise(() => {});
  if (mode === 'assertion') throw new Error('deliberate assertion failure');
}, mode === 'timeout' ? 100 : 30000);

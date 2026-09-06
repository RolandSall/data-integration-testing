import assert from 'node:assert/strict';
import type { TestingModule } from '@nestjs/testing';
import { InventoryRepository, InventoryService } from '../src/inventory.js';
import { applicationFor } from './application.js';

/** Identical application behavior for each runner, client, and handwritten baseline. */
export function inventoryScenarios(client: () => unknown, kind: string): void {
  let app: TestingModule;
  let repository: InventoryRepository;
  let service: InventoryService;
  beforeEach(async () => {
    app = await applicationFor(client(), kind);
    repository = app.get(InventoryRepository);
    service = app.get(InventoryService);
    await repository.addProduct('book', 10);
  });
  afterEach(async () => {
    // The context and client must still be usable in teardown.
    assert.ok(client());
    await app.close();
  });
  test('given stock, when reserving items, then stock and reservation change together', async () => {
    await service.reserve('book', 3, 'order-1');
    assert.equal(await repository.stock('book'), 7);
    assert.equal(await repository.reservationCount(), 1);
  });
  test('given a fresh transaction, when reading fixtures, then earlier reservations are absent', async () => {
    assert.equal(await repository.stock('book'), 10);
    assert.equal(await repository.reservationCount(), 0);
  });
  test.each([0, -1])('given invalid quantity %s, when reserving, then the operation is rejected', async (quantity) => {
    await assert.rejects(service.reserve('book', quantity, 'invalid'), /Quantity must be positive/);
    assert.equal(await repository.stock('book'), 10);
  });
  test('given insufficient stock, when reserving, then no reservation is created', async () => {
    await assert.rejects(service.reserve('book', 11, 'large'), /Insufficient stock/);
    assert.equal(await repository.reservationCount(), 0);
  });
  test('given an existing reference, when reserving again, then the database rejects duplication', async () => {
    await service.reserve('book', 1, 'duplicate');
    await assert.rejects(service.reserve('book', 1, 'duplicate'));
  });
}

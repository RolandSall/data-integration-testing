import { Inject, Injectable } from '@nestjs/common';

export abstract class InventoryRepository {
  abstract addProduct(sku: string, stock: number): Promise<void>;
  abstract reserve(sku: string, quantity: number, reference: string): Promise<void>;
  abstract stock(sku: string): Promise<number>;
  abstract reservationCount(): Promise<number>;
}
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

@Injectable()
export class InventoryService {
  constructor(@Inject(InventoryRepository) private readonly repository: InventoryRepository) {}
  async reserve(sku: string, quantity: number, reference: string): Promise<void> {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantity must be positive');
    await this.repository.reserve(sku, quantity, reference);
  }
}

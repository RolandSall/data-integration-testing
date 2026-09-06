import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/postgresql/index.js';
import { DATABASE_CLIENT, InventoryRepository } from './inventory.js';

@Injectable()
export class PrismaInventoryRepository extends InventoryRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: Prisma.TransactionClient) { super(); }
  async addProduct(sku: string, stock: number): Promise<void> {
    await this.client.product.create({ data: { sku, stock } });
  }
  async reserve(sku: string, quantity: number, reference: string): Promise<void> {
    const updated = await this.client.product.updateMany({ where: { sku, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
    if (updated.count !== 1) throw new Error('Insufficient stock');
    await this.client.reservation.create({ data: { reference, sku, quantity } });
  }
  async stock(sku: string): Promise<number> { return (await this.client.product.findUnique({ where: { sku } }))?.stock ?? 0; }
  async reservationCount(): Promise<number> { return this.client.reservation.count(); }
}

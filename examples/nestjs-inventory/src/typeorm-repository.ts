import { Inject, Injectable } from '@nestjs/common';
import { EntitySchema, type EntityManager } from 'typeorm';
import { DATABASE_CLIENT, InventoryRepository } from './inventory.js';

export const ProductEntity = new EntitySchema<{ sku: string; stock: number }>({
  name: 'Product', tableName: 'products', columns: { sku: { type: String, primary: true }, stock: { type: Number } },
});
export const ReservationEntity = new EntitySchema<{ reference: string; sku: string; quantity: number }>({
  name: 'Reservation', tableName: 'reservations', columns: { reference: { type: String, primary: true }, sku: { type: String }, quantity: { type: Number } },
});
@Injectable()
export class TypeOrmInventoryRepository extends InventoryRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly manager: EntityManager) { super(); }
  async addProduct(sku: string, stock: number): Promise<void> { await this.manager.getRepository(ProductEntity).insert({ sku, stock }); }
  async reserve(sku: string, quantity: number, reference: string): Promise<void> {
    const updated = await this.manager.getRepository(ProductEntity).createQueryBuilder().update()
      .set({ stock: () => 'stock - :quantity' }).where('sku = :sku AND stock >= :quantity', { sku, quantity }).execute();
    if (updated.affected !== 1) throw new Error('Insufficient stock');
    await this.manager.getRepository(ReservationEntity).insert({ reference, sku, quantity });
  }
  async stock(sku: string): Promise<number> { return (await this.manager.getRepository(ProductEntity).findOneBy({ sku }))?.stock ?? 0; }
  async reservationCount(): Promise<number> { return this.manager.getRepository(ReservationEntity).count(); }
}

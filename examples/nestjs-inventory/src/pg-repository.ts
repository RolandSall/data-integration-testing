import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DATABASE_CLIENT, InventoryRepository } from './inventory.js';

@Injectable()
export class PgInventoryRepository extends InventoryRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: PoolClient) { super(); }
  async addProduct(sku: string, stock: number): Promise<void> {
    await this.client.query('INSERT INTO products (sku, stock) VALUES ($1, $2)', [sku, stock]);
  }
  async reserve(sku: string, quantity: number, reference: string): Promise<void> {
    const updated = await this.client.query('UPDATE products SET stock = stock - $1 WHERE sku = $2 AND stock >= $1', [quantity, sku]);
    if (updated.rowCount !== 1) throw new Error('Insufficient stock');
    await this.client.query('INSERT INTO reservations (reference, sku, quantity) VALUES ($1, $2, $3)', [reference, sku, quantity]);
  }
  async stock(sku: string): Promise<number> {
    const result = await this.client.query<{ stock: number }>('SELECT stock FROM products WHERE sku = $1', [sku]);
    return result.rows[0]?.stock ?? 0;
  }
  async reservationCount(): Promise<number> {
    const result = await this.client.query<{ count: string }>('SELECT count(*) FROM reservations');
    return Number(result.rows[0]?.count);
  }
}

import { Test, type TestingModule } from '@nestjs/testing';
import { DATABASE_CLIENT, InventoryRepository, InventoryService } from '../src/inventory.js';
import { PgInventoryRepository } from '../src/pg-repository.js';
import { PrismaInventoryRepository } from '../src/prisma-repository.js';
import { TypeOrmInventoryRepository } from '../src/typeorm-repository.js';

export async function applicationFor(client: unknown, kind: string): Promise<TestingModule> {
  return Test.createTestingModule({ providers: [InventoryService,
    { provide: DATABASE_CLIENT, useValue: null },
    { provide: InventoryRepository, useClass: kind === 'typeorm' ? TypeOrmInventoryRepository : kind === 'prisma' || kind === 'sqlite' ? PrismaInventoryRepository : PgInventoryRepository },
  ] }).overrideProvider(DATABASE_CLIENT).useValue(client).compile();
}

import { installJestDataIntegrationTestSupport as install } from '@integration-testing/data/jest';
import { clientKind, pgContext, prismaContext, sqliteContext, typeormContext } from './context.js';
switch (clientKind) {
  case 'prisma': install(prismaContext); break;
  case 'sqlite': install(sqliteContext); break;
  case 'typeorm': install(typeormContext); break;
  default: install(pgContext);
}

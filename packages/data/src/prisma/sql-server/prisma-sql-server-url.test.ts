import { describe, expect, test } from 'vitest';
import { prismaSqlServerUrlFor } from './prisma-sql-server-url.js';

describe('Prisma SQL Server URL', () => {
  test(
    'given neutral SQL Server connection facts, when a Prisma URL is created, then consumer connection options are included',
    () => {
      expect(
        prismaSqlServerUrlFor(
          {
            host: '127.0.0.1',
            port: 14_333,
            database: 'example',
            username: 'sa',
            password: 'Container!Sql2026',
          },
          {
            encrypt: false,
            trustServerCertificate: true,
            schema: 'dbo',
          },
        ),
      ).toBe(
        'sqlserver://127.0.0.1:14333;database=example;user=sa;password=Container!Sql2026;schema=dbo;encrypt=false;trustServerCertificate=true',
      );
    },
  );

  test(
    'given credentials containing SQL Server delimiters, when a Prisma URL is created, then property values are escaped',
    () => {
      expect(
        prismaSqlServerUrlFor({
          host: 'localhost',
          port: 1_433,
          database: 'record;archive',
          username: 'domain/user',
          password: 'Pass:Word;',
        }),
      ).toBe(
        'sqlserver://localhost:1433;database={record;archive};user={domain/user};password={Pass:Word;}',
      );
    },
  );
});

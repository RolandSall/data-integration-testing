# Changelog

## 0.1.1

- Simplify the README with linked runnable examples and move detailed setup into a separate guide.
- Clarify database-independent lifecycle design versus verified database and client coverage.
- Preserve the Testcontainers pairing and make rollback boundaries easy to find.
- No runtime API changes.

## 0.1.0

- Add consistent annotation and function declarations across Jest and Vitest.
- Add shared context creation, bounded transaction sessions, and a dedicated Jest Node environment.
- Add the TypeORM adapter and preserve errors across rollback and resource release.
- Verify nested fixtures, retries, timeouts, expected failures, and declaration isolation in child processes.
- Include a repository-only NestJS consumer verified outside the workspace against the packed package, covering the real database matrix and handwritten baselines.
- Extract the database test annotation and lifecycle manager into `@integration-testing/data-isolation`.
- Include optional Prisma and node-postgres rollback adapters.
- Provide independent examples with the published Testcontainers package and without containers.
- Preserve original setup failures when cleanup also fails.
- Verify installed ESM/CommonJS consumers, declaration exports, and real database rollback.

Supported scope: Jest 30.1+ below 31 and Vitest 4.1; PostgreSQL through pg 8, Prisma 6.19, or
TypeORM 0.3; SQLite through Prisma 6.19. Testcontainers Integration 0.1.0 is optional and verified
through the shared launcher and manual global setup. Generated file-owned container setup,
automatic HTTP transaction propagation, other runners, and concurrent tests within a file
remain outside this release.

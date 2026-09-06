# Changelog

## 0.1.0-beta.0

- Add consistent annotation and function declarations across Jest and Vitest.
- Add shared context creation, bounded transaction sessions, and a dedicated Jest Node environment.
- Add the TypeORM adapter and preserve errors across rollback and resource release.
- Verify nested fixtures, retries, timeouts, expected failures, and declaration isolation in child processes.
- Add an independent NestJS consumer covering the real database matrix and handwritten baselines.
- Extract the database test annotation and lifecycle manager into `@integration-testing/data`.
- Include optional Prisma and node-postgres rollback adapters.
- Provide independent examples with the published Testcontainers package and without containers.
- Preserve original setup failures when cleanup also fails.
- Verify installed ESM/CommonJS consumers, declaration exports, and real database rollback.

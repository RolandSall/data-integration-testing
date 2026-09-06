# Changelog

## 0.1.0-beta.0

- Extract the database test annotation and lifecycle manager into `@integration-testing/data`.
- Include optional Prisma and node-postgres rollback adapters.
- Provide independent examples with the published Testcontainers package and without containers.
- Preserve original setup failures when cleanup also fails.
- Verify installed ESM/CommonJS consumers, declaration exports, and real database rollback.

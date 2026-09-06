import { migratePostgresUrl, migrateSqlite } from '../src/migrate.ts';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
if (url.startsWith('file:')) await migrateSqlite(url);
else await migratePostgresUrl(url);

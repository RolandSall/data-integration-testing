import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve as resolvePath } from 'node:path';
import { createDatabase, migratePostgres, dropDatabase, assertPostgresEmpty, type Database } from '../test/database.ts';
import { migrateSqlite } from '../src/migrate.ts';

const sqliteOnly = process.argv.includes('--sqlite');
const external = process.argv.includes('--external');
const perFile = process.argv.includes('--per-file');
const exerciseExternal = process.argv.includes('--exercise-external');
if (external && !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for an existing disposable PostgreSQL database');
let sharedPostgres: Database | undefined;
let sharedSqlite: Database | undefined;
let runtime: import('@integration-testing/testcontainers').ContainerRuntime | undefined;
await mkdir('.artifacts', { recursive: true });
async function run(runner: string, client: string, baseline = false, fault = ''): Promise<void> {
  const label = `${runner}/${client}${baseline ? '/handwritten' : ''}${fault ? '/' + fault : ''}`;
  console.log(`Running ${label}`);
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [resolvePath(runner === 'jest' ? 'node_modules/jest/bin/jest.js' : 'node_modules/vitest/vitest.mjs'), ...(runner === 'vitest' ? ['run'] : [])], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATA_CLIENT: client, BASELINE: baseline ? '1' : '', FAILURE_MODE: fault },
    });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 90_000);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
  await writeFile(`.artifacts/${label.replaceAll('/', '-')}.log`, result.output);
  if (fault) {
    assert.notEqual(result.code, 0, `Expected a failing process: ${label}`);
    assert.notEqual(result.code, null, `Runner was killed: ${label}`);
    assert.match(result.output, /DATABASE_CLEAN/, `${label} did not verify rollback and cleanup:\n${result.output}`);
    assert.match(result.output, fault === 'timeout' ? /timeout|timed out|Timeout/i : fault === 'connection' ? /terminat|connection|closed/i : new RegExp(`deliberate ${fault} failure`), result.output);
  } else if (result.code !== 0) throw new Error(`${label} failed:\n${result.output}`);
  console.log(`PASS ${label}`);
}
try {
  if (!sqliteOnly && !external) {
    const { Container, ContainerRuntime, createDefaultContainerRegistry } = await import('@integration-testing/testcontainers');
    runtime = new ContainerRuntime(createDefaultContainerRegistry());
    process.env.DATABASE_URL = (await runtime.start([Container.PostgreSql])).get(Container.PostgreSql).connectionUri;
  }
  if (!perFile) {
    if (!sqliteOnly) {
      sharedPostgres = await createDatabase();
      await migratePostgres(sharedPostgres);
      process.env.DATA_SCHEMA = sharedPostgres.schema;
      console.log('Application PostgreSQL migrations applied once before test workers');
    }
    if (!external) {
      sharedSqlite = await createDatabase(true);
      await migrateSqlite(sharedSqlite.url);
      process.env.DATA_SQLITE_URL = sharedSqlite.url;
    }
  }
  for (const runner of ['jest', 'vitest']) {
    for (const client of sqliteOnly ? ['sqlite'] : external ? ['pg', 'prisma', 'typeorm'] : ['pg', 'prisma', 'typeorm', 'sqlite']) {
      await run(runner, client);
      if (!external && !perFile) for (const fault of ['assertion', 'fixture', 'teardown', 'timeout', ...(client === 'sqlite' ? [] : ['connection'])]) await run(runner, client, false, fault);
    }
    if (!sqliteOnly) await run(runner, 'pg', true);
  }
  if (exerciseExternal && !external && !sqliteOnly) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/run-matrix.ts', '--external'], { stdio: 'inherit', env: { ...process.env, DATA_SCHEMA: '', DATA_SQLITE_URL: '' } });
      child.on('error', reject);
      child.on('exit', (code) => { if (code === 0) resolve(); else reject(new Error('External database consumer failed')); });
    });
  }
} finally {
  try {
    if (sharedPostgres) {
      try { await assertPostgresEmpty(sharedPostgres); } finally { await dropDatabase(sharedPostgres); }
    }
  } finally {
    try { if (sharedSqlite) await dropDatabase(sharedSqlite); } finally { await runtime?.stop(); }
  }
}

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = process.cwd();
const artifacts = resolve('.artifacts');
await mkdir(artifacts, { recursive: true });
await cp('README.md', 'packages/data/README.md');
const run = async (command: string, args: string[], cwd: string, quiet = false) => {
  try {
    const { stdout, stderr } = await exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
    if (stdout && !quiet) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return stdout;
  } catch (error) {
    if (error && typeof error === 'object') {
      if ('stdout' in error) process.stderr.write(String(error.stdout));
      if ('stderr' in error) process.stderr.write(String(error.stderr));
    }
    throw error;
  }
};
const packed: unknown = JSON.parse(await run('npm', ['pack', './packages/data', '--json', '--pack-destination', artifacts], root, true));
if (!Array.isArray(packed) || packed.length !== 1) throw new Error('Expected one npm archive');
const entry = packed[0] as { filename: string; files: { path: string }[] };
for (const { path } of entry.files) {
  if (!/^(dist\/|README\.md$|LICENSE$|package\.json$)/u.test(path) || path.endsWith('.map')
    || /(^|\/)(examples|node_modules|migrations|vendor)(\/|$)/u.test(path)) {
    throw new Error(`Unexpected published file: ${path}`);
  }
  const contents = await readFile(join(root, 'packages/data', path), 'utf8');
  if (/\/Users\/|workspace:\*/iu.test(contents)) {
    throw new Error(`Private path or stale extraction reference in ${path}`);
  }
}
const tarball = join(artifacts, entry.filename);
const temporary = await mkdtemp(join(tmpdir(), 'data-package-check-'));
try {
  const core = join(temporary, 'core');
  await mkdir(core);
  await writeFile(join(core, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], core);
  const smoke = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { DataIntegrationTest, isDataIntegrationTest, AsyncTransactionContext } from '@integration-testing/data-isolation';
    import { PrismaTransactionAdapter } from '@integration-testing/data-isolation/prisma';
    import { TypeOrmTransactionAdapter } from '@integration-testing/data-isolation/typeorm';
    import { installJestDataIntegrationTestSupport } from '@integration-testing/data-isolation/jest';
    import { prismaSqlServerUrlFor } from '@integration-testing/data-isolation/prisma/sql-server';
    import { PgTransactionAdapter } from '@integration-testing/data-isolation/pg';
    const require = createRequire(import.meta.url);
    class Suite {}
    DataIntegrationTest(Suite);
    assert.equal(isDataIntegrationTest(Suite), true);
    const context = new AsyncTransactionContext();
    assert.equal(await context.run('active', async () => context.current()), 'active');
    assert.equal(context.current(), undefined);
    assert.equal(typeof PrismaTransactionAdapter, 'function');
    assert.equal(typeof PgTransactionAdapter, 'function');
    assert.equal(typeof TypeOrmTransactionAdapter, 'function');
    assert.equal(typeof installJestDataIntegrationTestSupport, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation/typeorm').TypeOrmTransactionAdapter, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation/jest').installJestDataIntegrationTestSupport, 'function');
    assert.equal(typeof prismaSqlServerUrlFor, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation/prisma/sql-server').prismaSqlServerUrlFor, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation').DataIntegrationTestContextManager, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation/prisma').PrismaTransactionAdapter, 'function');
    assert.equal(typeof require('@integration-testing/data-isolation/pg').PgTransactionAdapter, 'function');
    for (const peer of ['vitest', 'pg', '@prisma/client', '@integration-testing/testcontainers', 'typeorm', 'jest', 'jest-environment-node', '@nestjs/common', '@nestjs/core', '@nestjs/testing']) {
      assert.throws(() => require.resolve(peer), { code: 'MODULE_NOT_FOUND' });
    }
  `;
  await writeFile(join(core, 'smoke.mjs'), smoke);
  await run('node', ['smoke.mjs'], core);
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'typescript@5.9.3', '@types/node@22', '@types/pg@8', 'typeorm@0.3.31', 'jest-environment-node@30.4.1'], core);
  const consumer = `import { DataIntegrationTestContextManager, type TransactionAdapter } from '@integration-testing/data-isolation';
import { PrismaTransactionAdapter } from '@integration-testing/data-isolation/prisma';
import { PgTransactionAdapter } from '@integration-testing/data-isolation/pg';
import { TypeOrmTransactionAdapter } from '@integration-testing/data-isolation/typeorm';
import { installJestDataIntegrationTestSupport } from '@integration-testing/data-isolation/jest';
import Environment from '@integration-testing/data-isolation/jest/environment';
void [TypeOrmTransactionAdapter, installJestDataIntegrationTestSupport, Environment];
import { prismaSqlServerUrlFor } from '@integration-testing/data-isolation/prisma/sql-server';
void prismaSqlServerUrlFor;
const adapter: TransactionAdapter<string, number> = { rollbackOnly: async (_client, work) => work(1) };
void [DataIntegrationTestContextManager, PrismaTransactionAdapter, PgTransactionAdapter, adapter];
`;
  for (const extension of ['mts', 'cts']) {
    await writeFile(join(core, `consumer.${extension}`), consumer);
    await run('node', ['node_modules/typescript/bin/tsc', '--strict', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2023', `consumer.${extension}`], core);
  }
  await cp(join(root, 'tsconfig.base.json'), join(temporary, 'tsconfig.base.json'));
  const examples = process.argv.includes('--docker')
    ? ['without-testcontainers', 'with-testcontainers'] : ['without-testcontainers'];
  for (const example of examples) {
    const directory = join(temporary, 'examples', example);
    await cp(join(root, 'examples', example), directory, {
      recursive: true,
      filter: (path) => !['node_modules', 'generated', 'dist'].includes(path.split('/').at(-1) ?? ''),
    });
    const manifestPath = join(directory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    manifest.dependencies['@integration-testing/data-isolation'] = tarball;
    await writeFile(manifestPath, JSON.stringify(manifest, undefined, 2));
    await run('bun', ['install', '--network-concurrency', '8'], directory);
    if (example === 'without-testcontainers') await run('bun', ['run', 'generate'], directory);
    await run('bun', ['run', 'test'], directory);
  }
  process.stdout.write('Archive contents, dependency independence, ESM/CJS runtime and types, and installed examples passed.\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

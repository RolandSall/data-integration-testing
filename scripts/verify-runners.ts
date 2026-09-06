import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.env.RUNNER_CONTRACT_ROOT ?? process.cwd();
const directory = resolve(root, '.artifacts/runner-contract');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', experimentalDecorators: true, esModuleInterop: true } }));
const context = `
import { appendFileSync } from 'node:fs';
import { createDataIntegrationTestContext } from '@integration-testing/data';
export const record = (event) => appendFileSync(process.env.CASE_TRACE, event + '\\n');
const scenario = process.env.CASE_NAME;
export const dataContext = createDataIntegrationTestContext({
  getResources: () => 'owned resources',
  createDatabase: async () => { record('create'); return {}; },
  createClient: async () => ({}),
  prepareDatabase: async () => { if (scenario === 'setup-failure') throw new Error('schema failure'); },
  closeClient: async () => { record('close'); if (scenario === 'cleanup-failure' || scenario === 'setup-failure') throw new Error('close failure'); },
  dropDatabase: async () => { record('drop'); },
  logger: { info() {}, error() {} },
  transactions: { rollbackOnly: async (_root, work) => {
    if (scenario === 'acquire-failure') throw new Error('acquisition failure');
    if (scenario === 'acquire-timeout') return new Promise(() => {});
    record('begin');
    try { return await work({ writes: [] }); }
    finally {
      record('rollback');
      if (scenario === 'rollback-failure' || scenario === 'expected-rollback-failure') throw new Error('rollback failure');
      if (scenario === 'rollback-timeout') await new Promise(() => {});
    }
  } },
});
`;
await writeFile(join(directory, 'context.ts'), context);
const common = `
import assert from 'node:assert/strict';
import { DataIntegrationTest, declareDataIntegrationTest } from '@integration-testing/data';
import { dataContext, record } from './context';
`;
const fixtures = `
beforeAll(() => { assert.throws(() => dataContext.getCurrentContext()); record('beforeAll'); });
beforeEach(() => { dataContext.getCurrentContext().client.writes.push('fixture'); record('beforeEach'); });
afterEach(() => { assert.equal(dataContext.getCurrentContext().client.writes[0], 'fixture'); record('afterEach'); });
afterAll(() => { assert.throws(() => dataContext.getCurrentContext()); record('afterAll'); });
`;
const cases = [
  { name: 'annotation', pass: true, body: '@DataIntegrationTest\nexport class Suite {}\n' + fixtures + `describe('nested', () => { test.each([1, 2])('case %s', () => { assert.deepEqual(dataContext.getCurrentContext().client.writes, ['fixture']); }); });`, transactions: 2 },
  { name: 'function', pass: true, body: 'declareDataIntegrationTest();\n' + fixtures + `test('body', () => { assert.deepEqual(dataContext.getCurrentContext().client.writes, ['fixture']); });`, transactions: 1 },
  { name: 'unmarked', pass: true, body: `test('inactive', () => { assert.throws(() => dataContext.getCurrentContext()); });`, transactions: 0 },
  { name: 'duplicate', pass: false, body: `declareDataIntegrationTest(); declareDataIntegrationTest(); test('never', () => {});`, error: 'one data integration declaration', transactions: 0 },
  { name: 'concurrent', pass: false, body: `declareDataIntegrationTest(); describe.concurrent('outer', () => { test('never', () => {}); });`, error: 'Concurrent tests', transactions: 0 },
  { name: 'done', pass: false, body: `declareDataIntegrationTest(); test('callback', (done) => { done(); });`, error: 'done' },
  { name: 'fixture-failure', pass: false, body: `declareDataIntegrationTest(); beforeEach(() => { throw new Error('fixture failure'); }); test('never', () => {});`, error: 'fixture failure', transactions: 1 },
  { name: 'assertion-failure', pass: false, body: `declareDataIntegrationTest();\n` + fixtures + `test('failure', () => { throw new Error('assertion failure'); });`, error: 'assertion failure', transactions: 1 },
  { name: 'acquire-failure', pass: false, body: `declareDataIntegrationTest(); test('never', () => {});`, error: 'acquisition failure', transactions: 0 },
  { name: 'acquire-timeout', pass: false, body: `declareDataIntegrationTest(); test('never', () => {});`, error: 'acquisition timed out', transactions: 0 },
  { name: 'rollback-failure', pass: false, body: `declareDataIntegrationTest(); test('body', () => {});`, error: 'rollback failure', transactions: 1 },
  { name: 'rollback-timeout', pass: false, body: `declareDataIntegrationTest(); test('body', () => {});`, error: 'rollback timed out', transactions: 1 },
  { name: 'expected-rollback-failure', pass: false, body: `declareDataIntegrationTest(); test.EXPECTED('expected', () => { throw new Error('expected assertion'); });`, error: 'rollback failure', transactions: 1 },
  { name: 'setup-failure', pass: false, body: `declareDataIntegrationTest(); test('never', () => {});`, error: 'schema failure', transactions: 0 },
  { name: 'cleanup-failure', pass: false, body: `declareDataIntegrationTest(); test('body', () => {});`, error: 'close failure', transactions: 1 },
  { name: 'test-timeout', pass: false, body: `declareDataIntegrationTest(); test('timeout', async () => { await new Promise(() => {}); }, 40);`, error: 'timeout|timed out|Exceeded timeout', transactions: 1 },
  { name: 'retry', pass: true, body: `declareDataIntegrationTest(); RETRY_SETUP let attempts = 0; test('retry', RETRY_OPTIONS () => { assert.equal(++attempts, 2); assert.deepEqual(dataContext.getCurrentContext().client.writes, []); });`, transactions: 2 },
  { name: 'skipped-file', pass: true, body: `declareDataIntegrationTest(); test.skip('not selected', () => { throw new Error('must not run'); });`, transactions: 0 },
  { name: 'skip', pass: true, body: `declareDataIntegrationTest(); test.skip('skipped', () => {}); test.todo('todo'); test.only('selected', () => {}); test('filtered', () => { throw new Error('must not run'); });`, transactions: 1 },
];

for (const runner of ['jest', 'vitest'] as const) {
  await writeFile(join(directory, 'setup.ts'), `import { dataContext } from './context';\nimport { install${runner === 'jest' ? 'Jest' : 'Vitest'}DataIntegrationTestSupport } from '@integration-testing/data/${runner}';\ninstall${runner === 'jest' ? 'Jest' : 'Vitest'}DataIntegrationTestSupport(dataContext, { transactionLifecycleTimeoutMs: 100 });\n`);
  await writeFile(join(directory, 'jest.config.cjs'), `module.exports = { rootDir: __dirname, testMatch: ['**/*.test.ts'], testEnvironment: '@integration-testing/data/jest/environment', setupFilesAfterEnv: ['<rootDir>/setup.ts'], transform: { '^.+\\\\.ts$': ['ts-jest', { diagnostics: false, tsconfig: { module: 'CommonJS', target: 'ES2023', experimentalDecorators: true, esModuleInterop: true, isolatedModules: true } }] } };`);
  await writeFile(join(directory, 'vitest.config.mts'), `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { root: ${JSON.stringify(directory)}, include: ['**/*.test.ts'], globals: true, setupFiles: ['./setup.ts'], maxWorkers: 1 } });`);
  for (const scenario of cases) {
    // Jest has concurrent tests but no describe.concurrent; inheritance is exercised in Vitest.
    let body = scenario.body.replace('test.EXPECTED', runner === 'jest' ? 'test.failing' : 'test.fails')
      .replace('RETRY_SETUP', runner === 'jest' ? 'jest.retryTimes(1, { retryImmediately: true });' : '')
      .replace('RETRY_OPTIONS', runner === 'vitest' ? '{ retry: 1 },' : '');
    if (runner === 'jest' && scenario.name === 'concurrent') body = `declareDataIntegrationTest(); test.concurrent('never', () => {});`;
    await writeFile(join(directory, 'scenario.test.ts'), common + body);
    // A second file shares the worker process but must never inherit activation.
    await writeFile(join(directory, 'unmarked.test.ts'), common + `test('no declaration leakage', () => { assert.throws(() => dataContext.getCurrentContext()); });`);
    const trace = join(directory, 'trace.log');
    await writeFile(trace, '');
    const args = runner === 'jest'
      ? [join(root, 'node_modules/jest/bin/jest.js'), '--config', join(directory, 'jest.config.cjs'), '--runInBand']
      : [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', join(directory, 'vitest.config.mts')];
    const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
      const child = spawn(process.execPath.includes('bun') ? 'node' : process.execPath, args, { cwd: root, env: { ...process.env, CASE_NAME: scenario.name, CASE_TRACE: trace, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 30_000);
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => { clearTimeout(timer); resolveResult({ code, output }); });
    });
    const events = (await readFile(trace, 'utf8')).trim().split('\n');
    const message = `${runner}/${scenario.name}\n${result.output}\n${events.join(',')}`;
    assert.equal(result.code === 0, scenario.pass, message);
    if (scenario.error) assert.match(result.output, new RegExp(scenario.error, 'i'), message);
    if (scenario.transactions !== undefined) {
      assert.equal(events.filter((value) => value === 'begin').length, scenario.transactions, message);
      assert.equal(events.filter((value) => value === 'rollback').length, scenario.transactions, message);
    }
    if (events.includes('create')) {
      assert.equal(events.filter((value) => value === 'close').length, 1, message);
      assert.equal(events.filter((value) => value === 'drop').length, 1, message);
    }
    if (events.includes('afterAll')) assert.ok(events.indexOf('afterAll') < events.indexOf('close'), message);
    console.log(`PASS ${runner}/${scenario.name}`);
  }
}

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'data-runner-minimum-'));
async function run(command: string, args: string[], env = process.env): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: directory, stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => { if (code === 0) resolveRun(); else reject(new Error(`${command} exited ${code}`)); });
  });
}
try {
  const metadata = JSON.parse(await readFile(resolve('packages/data/package.json'), 'utf8')) as { version: string };
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
    '@integration-testing/data': `file:${resolve(`.artifacts/integration-testing-data-${metadata.version}.tgz`)}`,
    jest: '30.1.0', 'jest-environment-node': '30.1.0', 'ts-jest': '^29.4.1', typescript: '^5.9.2', vitest: '~4.1.11',
  } }));
  await run('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund']);
  await run('bun', [join(root, 'scripts/verify-runners.ts')], { ...process.env, RUNNER_CONTRACT_ROOT: directory });
} finally { await rm(directory, { recursive: true, force: true }); }

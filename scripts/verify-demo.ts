import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const demoCommit = '1f2c3de81e6aec29f80bcfb6041f5f719acb8bf0';
const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'data-independent-consumer-'));
const checkout = join(directory, 'demo');
async function run(command: string, args: string[], cwd = checkout): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => { if (code === 0) resolveRun(); else reject(new Error(`${command} exited ${code}`)); });
  });
}
try {
  await run('bun', ['run', 'build'], root);
  await run('npm', ['pack', './packages/data', '--pack-destination', directory, '--silent'], root);
  const metadata = JSON.parse(await readFile(join(root, 'packages/data/package.json'), 'utf8')) as { version: string };
  const archive = join(directory, `integration-testing-data-${metadata.version}.tgz`);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  await run('git', ['clone', '--depth', '1', 'https://github.com/RolandSall/data-integration-testing-demo.git', checkout], directory);
  await run('git', ['fetch', '--depth', '1', 'origin', demoCommit]);
  await run('git', ['checkout', '--detach', demoCommit]);
  const filename = `current-candidate-${digest}.tgz`;
  await copyFile(archive, join(checkout, 'vendor', filename));
  const manifestPath = join(checkout, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { devDependencies: Record<string, string> };
  manifest.devDependencies['@integration-testing/data'] = `file:vendor/${filename}`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await run('bun', ['install', '--network-concurrency', '8']);
  await run('bun', ['run', 'generate']);
  await run('bun', ['run', 'typecheck']);
  await run('bun', ['run', 'test', '--exercise-external']);
  await run('bun', ['run', 'test:per-file']);
  console.log(`Independent consumer ${demoCommit} passed with archive SHA-256 ${digest}`);
} finally { await rm(directory, { recursive: true, force: true }); }

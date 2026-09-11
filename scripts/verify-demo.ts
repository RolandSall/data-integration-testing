import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'data-independent-consumer-'));
const checkout = join(directory, 'nestjs-inventory');
const sqliteOnly = process.argv.includes('--sqlite');
const published = process.argv.includes('--published');
const publishedConsumerNpm = 'npm@11.19.1';
async function run(command: string, args: string[], cwd = checkout): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => { if (code === 0) resolveRun(); else reject(new Error(`${command} exited ${code}`)); });
  });
}
try {
  const metadata = JSON.parse(await readFile(join(root, 'packages/data/package.json'), 'utf8')) as { name: string; version: string };
  let archive: string | undefined;
  let digest: string | undefined;
  if (!published) {
    await run('bun', ['run', 'build'], root);
    await run('npm', ['pack', './packages/data', '--pack-destination', directory, '--silent'], root);
    archive = join(directory, `integration-testing-data-isolation-${metadata.version}.tgz`);
    digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  }
  await cp(join(root, 'examples/nestjs-inventory'), checkout, {
    recursive: true,
    filter: (path) => !['node_modules', 'generated', '.artifacts', 'dist'].includes(path.split('/').at(-1) ?? ''),
  });
  let packageSpecifier = metadata.version;
  if (archive !== undefined) {
    await mkdir(join(checkout, 'vendor'));
    const filename = `current-candidate-${digest}.tgz`;
    await copyFile(archive, join(checkout, 'vendor', filename));
    packageSpecifier = `file:vendor/${filename}`;
  }
  const manifestPath = join(checkout, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { devDependencies: Record<string, string> };
  manifest.devDependencies[metadata.name] = packageSpecifier;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  if (published) {
    await run('npm', [
      'exec',
      '--yes',
      `--package=${publishedConsumerNpm}`,
      '--',
      'npm',
      'install',
      '--registry=https://registry.npmjs.org',
      '--no-audit',
      '--no-fund',
    ]);
  }
  else await run('bun', ['install', '--network-concurrency', '8']);
  await run('bun', ['run', 'generate']);
  await run('bun', ['run', 'typecheck']);
  if (sqliteOnly) await run('bun', ['run', 'test:sqlite']);
  else {
    await run('bun', ['run', 'test', '--exercise-external']);
    await run('bun', ['run', 'test:per-file']);
  }
  console.log(published
    ? `Repository example passed outside the workspace with ${metadata.name}@${metadata.version} installed from npm`
    : `Repository example passed outside the workspace with archive SHA-256 ${digest}`);
} finally { await rm(directory, { recursive: true, force: true }); }

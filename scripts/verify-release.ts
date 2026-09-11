import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('packages/data/package.json', 'utf8')) as { name: string; version: string; private?: boolean };
if (manifest.private || manifest.name !== '@integration-testing/data-isolation') throw new Error('Unexpected release package');
const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`);
if (response.status !== 404) {
  throw new Error(response.ok ? 'Package version is already published' : `Registry check failed: ${response.status}`);
}
console.log(`${manifest.name}@${manifest.version} is available for publication`);

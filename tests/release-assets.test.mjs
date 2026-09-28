import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dump, load } from 'js-yaml';
import { releaseAssets, verifyReleaseAssets } from '../scripts/release-assets.mjs';

let directory;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'go-release-assets-'));
  for (const group of releaseAssets('0.2.0')) {
    const files = [];
    for (const url of group.files) {
      const bytes = Buffer.from(`release fixture: ${url}`);
      await writeFile(join(directory, url), bytes);
      files.push({
        url,
        size: bytes.length,
        sha512: createHash('sha512').update(bytes).digest('base64'),
      });
    }
    await writeFile(
      join(directory, group.manifest),
      dump({ version: '0.2.0', files, path: files[0].url, sha512: files[0].sha512 }),
    );
  }
}
it('validates all installers and both isolated platform/edition update feeds', async () => {
  await fixture();
  const result = await verifyReleaseAssets(directory, '0.2.0');
  expect(result.files).toHaveLength(10);
  expect(result.files).toContain('LLM-Go-Trainer-0.2.0-mac-arm64-minimal.zip');
  expect(result.files).toContain('latest.yml');
  expect(result.files).toContain('minimal-mac.yml');
  expect(result.checksums.trim().split('\n')).toHaveLength(10);
});
it('refuses to publish missing update metadata or corrupted installer bytes', async () => {
  await fixture();
  const manifest = join(directory, 'minimal.yml');
  const original = await readFile(manifest);
  await rm(manifest);
  await expect(verifyReleaseAssets(directory, '0.2.0')).rejects.toThrow('Expected all installers');
  await writeFile(manifest, original);
  await writeFile(join(directory, 'LLM-Go-Trainer-0.2.0-windows-x64-minimal.exe'), 'corrupt');
  await expect(verifyReleaseAssets(directory, '0.2.0')).rejects.toThrow('checksum/size');
});
it('rejects an edition swap in manifests even if the other installer is valid', async () => {
  await fixture();
  const standard = load(await readFile(join(directory, 'latest.yml'), 'utf8'));
  await writeFile(join(directory, 'minimal.yml'), dump(standard));
  await expect(verifyReleaseAssets(directory, '0.2.0')).rejects.toThrow(
    'incorrect version or edition',
  );
});

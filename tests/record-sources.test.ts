import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { c as tar } from 'tar';
import { RecordSources } from '../server/record-sources';
import { prepareRecords } from '../scripts/prepare-records';
import { fileHash } from '../server/download';
import { configurePresets, presetRecord, presetSgf, searchPresets } from '../server/presets';

let directory: string, server: Server, sources: RecordSources;
afterEach(async () => {
  await sources?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  configurePresets(join(directory, 'absent'));
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'record-download-'));
  const archive = join(directory, 'source.tgz');
  await tar({ gzip: true, file: archive, cwd: resolve('tests/fixtures') }, ['download-record.sgf']);
  const bytes = await readFile(archive);
  server = createServer((_req, res) => {
    res.setHeader('Content-Length', bytes.length);
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    name: 'fixture',
    url: `http://127.0.0.1:${address.port}/games.tgz`,
    sha256: await fileHash(archive),
  };
}
async function finished() {
  await expect.poll(() => sources.list()[0].state).not.toMatch(/downloading|importing/);
}
it('minimal starts empty, downloads and imports a verified source atomically, and survives restart', async () => {
  const artifact = await fixture();
  const installed = join(directory, 'installed');
  sources = new RecordSources(installed, join(directory, 'absent'), artifact);
  expect(searchPresets().total).toBe(0);
  expect(sources.list()[0].state).toBe('available');
  expect(() => sources.start('unknown')).toThrow();
  sources.start('cwi');
  expect(sources.start('cwi')[0].state).toBe('downloading');
  await finished();
  expect(sources.list()[0]).toMatchObject({ state: 'installed', count: 1, bundled: false });
  const record = searchPresets().games[0];
  expect(presetRecord(record.id)?.game.moves).toHaveLength(2);
  expect(presetSgf(record.id)).not.toContain('Annotation');
  expect(existsSync(join(installed, 'cwi.installing'))).toBe(false);
  await sources.close();
  sources = new RecordSources(installed, join(directory, 'absent'), artifact);
  expect(sources.list()[0].state).toBe('installed');
  expect(searchPresets().games[0].id).toBe(record.id);
});
it('cancels without publishing partial records, retries, and uses bundled data without copying it', async () => {
  const artifact = await fixture();
  sources = new RecordSources(join(directory, 'installed'), join(directory, 'absent'), artifact);
  sources.start('cwi');
  await sources.cancel('cwi');
  expect(sources.list()[0].state).toBe('available');
  expect(searchPresets().total).toBe(0);
  sources.start('cwi');
  await finished();
  expect(sources.list()[0].state).toBe('installed');
  sources = new RecordSources(
    join(directory, 'unused'),
    join(directory, 'installed/cwi'),
    artifact,
  );
  expect(sources.start('cwi')[0]).toMatchObject({ state: 'installed', bundled: true });
  expect(existsSync(join(directory, 'unused'))).toBe(false);
});
it('rejects bad checksums and never exposes an incomplete catalog', async () => {
  const artifact = await fixture();
  sources = new RecordSources(join(directory, 'installed'), join(directory, 'absent'), {
    ...artifact,
    sha256: '0'.repeat(64),
  });
  sources.start('cwi');
  await finished();
  expect(sources.list()[0]).toMatchObject({ state: 'error' });
  expect(sources.list()[0].error).toContain('校验失败');
  expect(searchPresets().total).toBe(0);
});

it('prepares verified standard resources outside the workspace and never prepares minimal resources', async () => {
  const artifact = await fixture();
  const cache = join(directory, 'build-cache');
  const source = { artifact, count: 1, sizeBytes: 1 };
  expect(await prepareRecords(cache, 'minimal', source)).toEqual([]);
  expect(existsSync(cache)).toBe(false);
  expect(await prepareRecords(cache, 'standard', source)).toEqual([
    { from: join(cache, 'cwi'), to: 'records/cwi' },
  ]);
  const index = JSON.parse(await readFile(join(cache, 'cwi/index.json'), 'utf8'));
  expect(index).toMatchObject({ count: 1, files: 1, sourceSha256: artifact.sha256 });
  expect(await prepareRecords(cache, 'minimal', source)).toEqual([]);
});

it('fails standard packaging instead of publishing an incomplete catalog', async () => {
  const artifact = await fixture();
  const cache = join(directory, 'build-cache');
  await expect(
    prepareRecords(cache, 'standard', { artifact, count: 2, sizeBytes: 1 }),
  ).rejects.toThrow('Incomplete CWI catalog');
  expect(existsSync(join(cache, 'cwi'))).toBe(false);
  expect(existsSync(join(cache, 'cwi.installing'))).toBe(false);
});

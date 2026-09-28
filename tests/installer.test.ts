import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { installLock } from '../server/installer';
import { unpackBottle, unpackZip } from '../server/archive';
const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'go-install-'));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(directories.map((dir) => rm(dir, { force: true, recursive: true })));
});
it('recovers stale invalid locks but does not remove a live install lock', async () => {
  const dir = await directory(),
    path = join(dir, 'install.lock');
  await writeFile(path, '');
  await utimes(path, new Date(0), new Date(0));
  const unlock = await installLock(dir, new AbortController().signal);
  expect(JSON.parse(await readFile(path, 'utf8')).pid).toBe(process.pid);
  await expect(installLock(dir, AbortSignal.timeout(50))).rejects.toThrow();
  expect(JSON.parse(await readFile(path, 'utf8')).pid).toBe(process.pid);
  await unlock();
  expect(await readdir(dir)).toEqual([]);
});
it('extracts the runtime and notices from a bottle without unrelated model payloads', async () => {
  const dir = await directory();
  await mkdir(join(dir, 'pkg/bin'), { recursive: true });
  await writeFile(join(dir, 'pkg/bin/katago'), 'executable');
  await writeFile(join(dir, 'pkg/LICENSE'), 'license');
  await writeFile(join(dir, 'pkg/unused.bin.gz'), 'not needed');
  await tar.c({ gzip: true, file: join(dir, 'bottle.tar.gz'), cwd: dir }, ['pkg']);
  await unpackBottle(join(dir, 'bottle.tar.gz'), join(dir, 'out'), new AbortController().signal);
  expect(await readFile(join(dir, 'out/pkg/bin/katago'), 'utf8')).toBe('executable');
  expect(await readFile(join(dir, 'out/pkg/LICENSE'), 'utf8')).toBe('license');
  expect(await readdir(join(dir, 'out/pkg'))).not.toContain('unused.bin.gz');
});
// Minimal stored ZIP fixture; avoids an extra archive writer dependency.
function zip(name: string, symlink = false) {
  const filename = Buffer.from(name),
    data = Buffer.from('abc');
  const local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(0x352441c2, 14);
  local.writeUInt32LE(3, 18);
  local.writeUInt32LE(3, 22);
  local.writeUInt16LE(filename.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(0x352441c2, 16);
  central.writeUInt32LE(3, 20);
  central.writeUInt32LE(3, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(((symlink ? 0xa1ff : 0x81a4) << 16) >>> 0, 38);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}
it('unpacks nested Windows runtime files', async () => {
  const dir = await directory();
  await writeFile(join(dir, 'test.zip'), zip('bin/katago.exe'));
  await unpackZip(join(dir, 'test.zip'), join(dir, 'out'), new AbortController().signal);
  expect(await readFile(join(dir, 'out/bin/katago.exe'), 'utf8')).toBe('abc');
});
it.each([
  ['../outside', false],
  ['link.dll', true],
] as const)('rejects unsafe ZIP entry %s', async (name, link) => {
  const dir = await directory();
  await writeFile(join(dir, 'test.zip'), zip(name, link));
  await expect(
    unpackZip(join(dir, 'test.zip'), join(dir, 'out'), new AbortController().signal),
  ).rejects.toThrow();
});

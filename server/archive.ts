import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import * as yauzl from 'yauzl';

export function safeArchivePath(path: string) {
  if (isAbsolute(path) || /(^|\/)\.\.(\/|$)|\\|^[A-Za-z]:/.test(path))
    throw new Error('压缩包包含不安全路径');
  return path;
}
export async function unpackZip(file: string, destination: string, signal: AbortSignal) {
  await mkdir(destination, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      let size = 0;
      const abort = () => {
        zip.close();
        reject(new Error('解压已停止'));
      };
      signal.addEventListener('abort', abort, { once: true });
      zip.once('close', () => signal.removeEventListener('abort', abort));
      zip.once('error', reject);
      zip.once('end', resolve);
      zip.on('entry', (entry) => {
        void (async () => {
          signal.throwIfAborted();
          const name = safeArchivePath(entry.fileName);
          const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (kind === 0xa000) throw new Error('ZIP 不允许符号链接');
          size += entry.uncompressedSize;
          if (size > 2_000_000_000) throw new Error('解压大小超出限制');
          const path = join(destination, name);
          if (name.endsWith('/')) await mkdir(path, { recursive: true });
          else {
            await mkdir(dirname(path), { recursive: true });
            const stream = await new Promise<import('node:stream').Readable>((done, fail) =>
              zip.openReadStream(entry, (err, input) => (err || !input ? fail(err) : done(input))),
            );
            await pipeline(stream, createWriteStream(path, { flags: 'wx' }), { signal });
          }
          zip.readEntry();
        })().catch((error) => {
          zip.close();
          reject(error);
        });
      });
      if (signal.aborted) abort();
      else zip.readEntry();
    });
  });
}
export async function unpackBottle(file: string, destination: string, signal: AbortSignal) {
  const aliases = new Map<string, string>();
  let size = 0;
  let failure: Error | undefined;
  await mkdir(destination, { recursive: true });
  await tar.x({
    file,
    cwd: destination,
    strict: true,
    preservePaths: false,
    filter(path, raw) {
      const entry = raw as tar.ReadEntry;
      if (failure) return false;
      try {
        signal.throwIfAborted();
        safeArchivePath(path);
        if (entry.type === 'SymbolicLink' && path.endsWith('.dylib')) {
          if (!entry.linkpath) throw new Error('无效动态库链接');
          safeArchivePath(entry.linkpath);
          // Bottle library aliases must stay in their own directory. Materialize after extraction.
          if (entry.linkpath.includes('/') || entry.linkpath.includes('\\'))
            throw new Error('动态库链接越界');
          aliases.set(path, join(dirname(path), entry.linkpath));
          return false;
        }
        if (entry.type !== 'File' && entry.type !== 'Directory') return false;
        if (entry.type === 'Directory') return true;
        const include =
          /\/bin\/katago$|\.dylib$|b18c384nbt.*\.bin\.gz$|\/(?:LICENSE|COPYING|COPYRIGHT|NOTICE)[^/]*$/i.test(
            path,
          );
        if (include) {
          size += entry.size;
          if (size > 2_000_000_000) throw new Error('解压大小超出限制');
        }
        return include;
      } catch (error) {
        failure = error instanceof Error ? error : new Error('压缩包无效');
        return false;
      }
    },
  });
  if (failure) throw failure;
  return aliases;
}

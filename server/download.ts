import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface Artifact {
  name: string;
  url: string;
  sha256: string;
}
export interface DownloadProgress {
  label: string;
  received: number;
  total?: number;
}
export async function fileHash(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function verified(file: string, sha256: string) {
  try {
    return (await stat(file)).isFile() && (await fileHash(file)) === sha256;
  } catch {
    return false;
  }
}
async function responseFor(url: string, signal: AbortSignal, offset: number) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))
  )
    throw new Error('下载地址必须使用 HTTPS');
  const headers: Record<string, string> = offset ? { Range: `bytes=${offset}-` } : {};
  if (parsed.hostname === 'ghcr.io') {
    const repository = parsed.pathname.match(/^\/v2\/(homebrew\/core\/[^/]+)\/blobs\//)?.[1];
    if (!repository) throw new Error('无效的 Homebrew 下载地址');
    const response = await fetch(
      `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`,
      { signal },
    );
    if (!response.ok) throw new Error(`下载认证 HTTP ${response.status}`);
    const token = (await response.json()) as { token: string };
    headers.Authorization = `Bearer ${token.token}`;
  }
  // fetch drops Authorization when following redirects to a different origin.
  const response = await fetch(url, { signal, headers });
  if ((!response.ok && response.status !== 416) || !response.body)
    throw new Error(`下载失败 HTTP ${response.status}：${parsed.hostname}`);
  if (!response.url.startsWith('https:') && parsed.protocol === 'https:')
    throw new Error('下载重定向未使用 HTTPS');
  return response;
}
export async function downloadArtifact(
  artifact: Artifact,
  directory: string,
  signal: AbortSignal,
  progress: (value: DownloadProgress) => void,
  bundledDirectory?: string,
) {
  signal.throwIfAborted();
  const target = join(directory, artifact.sha256);
  await mkdir(dirname(target), { recursive: true });
  if (await verified(target, artifact.sha256)) return target;
  // Release archives live outside app.asar and are verified before extraction.
  const bundled = bundledDirectory && join(bundledDirectory, artifact.sha256);
  if (bundled && (await verified(bundled, artifact.sha256))) {
    signal.throwIfAborted();
    return bundled;
  }
  const temp = target + '.part';
  if (await verified(temp, artifact.sha256)) {
    await rm(target, { force: true });
    await rename(temp, target);
    return target;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      signal.throwIfAborted();
      let offset = (await stat(temp).catch(() => undefined))?.size ?? 0;
      progress({ label: artifact.name, received: offset });
      const response = await responseFor(
        artifact.url,
        AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)]),
        offset,
      );
      if (response.status === 416) {
        await response.body?.cancel();
        await rm(temp, { force: true });
        throw new Error('续传文件长度无效，重新下载');
      }
      let total = Number(response.headers.get('content-length')) || undefined;
      if (response.status === 206) {
        const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!range || Number(range[1]) !== offset || Number(range[2]) + 1 !== Number(range[3])) {
          await response.body?.cancel();
          await rm(temp, { force: true });
          throw new Error('下载续传范围不匹配');
        }
        total = Number(range[3]);
      } else offset = 0; // Server may ignore Range; replace, never append a full response.
      if ((total && total > 2_000_000_000) || offset > 2_000_000_000) {
        await response.body?.cancel();
        throw new Error('下载文件超出限制');
      }
      let received = offset,
        last = 0;
      progress({ label: artifact.name, received, total });
      await pipeline(
        Readable.fromWeb(response.body! as import('node:stream/web').ReadableStream<Uint8Array>),
        new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > 2_000_000_000) {
              callback(new Error('下载文件超出限制'));
              return;
            }
            if (Date.now() - last > 150) {
              last = Date.now();
              progress({ label: artifact.name, received, total });
            }
            callback(null, chunk);
          },
        }),
        createWriteStream(temp, { flags: offset ? 'a' : 'w' }),
        { signal },
      );
      if (!(await verified(temp, artifact.sha256))) {
        await rm(temp, { force: true });
        throw new Error(`${artifact.name} 校验失败`);
      }
      signal.throwIfAborted();
      await rm(target, { force: true });
      await rename(temp, target);
      progress({ label: artifact.name, received, total: received });
      return target;
    } catch (error) {
      if (signal.aborted) {
        await rm(temp, { force: true });
        signal.throwIfAborted();
      }
      if (attempt === 2) {
        const detail = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error ? (error.cause as NodeJS.ErrnoException) : undefined;
        throw new Error(
          `${artifact.name} 下载失败（${new URL(artifact.url).hostname}）：${detail}${cause?.code ? ` [${cause.code}]` : ''}`,
          { cause: error },
        );
      }
      try {
        await delay(300 * (attempt + 1), undefined, { signal });
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    }
  }
  throw new Error('下载失败');
}

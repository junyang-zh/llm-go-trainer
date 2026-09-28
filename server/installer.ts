import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { release } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { EngineStatus } from '../shared/types';
import type { EngineConfig } from './katago';
import { downloadArtifact, fileHash, verified } from './download';
import { safeArchivePath, unpackBottle, unpackZip } from './archive';
import { ensureModel } from './model-files';
import artifacts from '../config/katago/artifacts.json';
import bottles from '../config/katago/macos-bottles.json';

export type InstallProgress = Pick<EngineStatus, 'phase' | 'progress'>;
export interface Runtime {
  config: EngineConfig;
  backend: string;
}
// Native engines cannot read Electron's app.asar virtual filesystem.
export async function prepareConfig(source: string, directory: string) {
  await mkdir(directory, { recursive: true });
  const target = join(directory, 'analysis.cfg');
  if (resolve(source) !== resolve(target)) await copyFile(source, target);
  return target;
}
export function runtimePlatform(
  platform = process.platform,
  arch = process.arch,
  osRelease = release(),
) {
  if (platform === 'darwin' && arch === 'arm64' && Number(osRelease.split('.')[0]) >= 24)
    return { key: 'darwin-arm64', backend: 'Metal' };
  if (platform === 'win32' && arch === 'x64') return { key: 'win32-x64', backend: 'OpenCL' };
  throw new Error('自动安装支持 macOS 15+ Apple Silicon 和 Windows x64；其他平台可接入外部引擎');
}
async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
export async function installLock(directory: string, signal: AbortSignal) {
  const path = join(directory, 'install.lock');
  while (true) {
    signal.throwIfAborted();
    try {
      const file = await open(path, 'wx');
      try {
        await file.writeFile(JSON.stringify({ pid: process.pid }));
      } finally {
        await file.close();
      }
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(await readFile(path, 'utf8')) as { pid: number };
        if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('无效的安装锁');
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            await rm(path, { force: true });
            continue;
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        // A process may have died between creating the lock and writing its PID.
        // Leave a fresh empty file alone so a live writer can finish.
        const info = await stat(path).catch(() => undefined);
        if (info && Date.now() - info.mtimeMs > 10000) {
          await rm(path, { force: true });
          continue;
        }
      }
      await delay(250, undefined, { signal });
    }
  }
}
export async function ensureRuntime(
  root: string,
  directory: string,
  signal: AbortSignal,
  progress: (state: InstallProgress) => void,
  platform = runtimePlatform(),
): Promise<Runtime> {
  await mkdir(directory, { recursive: true });
  const unlock = await installLock(directory, signal);
  let staging: string | undefined;
  try {
    const config = await prepareConfig(join(root, 'config/katago/analysis.cfg'), directory);
    const cache = join(directory, 'downloads');
    const models = join(directory, 'models');
    const target = join(directory, `${platform.key}-${artifacts.revision}`);
    const manifestPath = join(target, 'installed.json');
    const env = { ...process.env };
    delete env.DEEPSEEK_API_KEY;
    const startupTimeout = Number(process.env.KATAGO_STARTUP_TIMEOUT_MS);
    const runtime = (): Runtime => ({
      backend: platform.backend,
      config: {
        executable: join(target, platform.key === 'win32-x64' ? 'bin/katago.exe' : 'bin/katago'),
        model: join(models, `${artifacts.main.sha256}.bin.gz`),
        humanModel: join(models, `${artifacts.human.sha256}.bin.gz`),
        config,
        cwd: directory,
        env:
          platform.key === 'darwin-arm64'
            ? { ...env, DYLD_LIBRARY_PATH: join(target, 'lib') }
            : env,
        timeout: Number(process.env.KATAGO_TIMEOUT_MS) || 180000,
        startupTimeout:
          Number.isFinite(startupTimeout) && startupTimeout >= 1000 ? startupTimeout : undefined,
      },
    });
    // Verify cached models too. A completed manifest alone is not proof of valid files.
    let installed = false;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        files: Record<string, string>;
      };
      const entries = Object.entries(manifest.files);
      installed = entries.some(
        ([path]) => path === (platform.key === 'win32-x64' ? 'bin/katago.exe' : 'bin/katago'),
      );
      for (const [path, hash] of entries) {
        signal.throwIfAborted();
        if (!(await verified(join(target, safeArchivePath(path)), hash))) {
          installed = false;
          break;
        }
      }
    } catch {
      /* first run or incomplete installation */
    }
    if (!installed) {
      staging = await mkdtemp(join(directory, '.install-'));
      const extracted = join(staging, 'packages');
      const bin = join(staging, 'bin'),
        lib = join(staging, 'lib');
      await mkdir(bin);
      await mkdir(lib);
      const download = async (artifact: typeof artifacts.main) =>
        downloadArtifact(
          artifact,
          cache,
          signal,
          (value) => progress({ phase: 'downloading', progress: value }),
          process.env.GO_TRAINER_BUNDLED_RUNTIME,
        );
      if (platform.key === 'darwin-arm64') {
        for (const bottle of bottles) {
          const archive = await download(bottle);
          progress({ phase: 'installing', progress: { label: bottle.name, received: 0 } });
          const aliases = await unpackBottle(archive, extracted, signal);
          for (const [alias, initial] of aliases) {
            let source = initial;
            const seen = new Set([alias]);
            while (aliases.has(source)) {
              if (seen.has(source)) throw new Error('动态库链接循环');
              seen.add(source);
              source = aliases.get(source)!;
            }
            await copyFile(join(extracted, source), join(extracted, alias));
          }
        }
        for (const path of await files(extracted)) {
          if (basename(path) === 'katago') {
            await copyFile(path, join(bin, 'katago'));
            await chmod(join(bin, 'katago'), 0o755);
          } else if (path.endsWith('.dylib')) await copyFile(path, join(lib, basename(path)));
          else if (
            path.includes('b18c384nbt') &&
            path.endsWith('.bin.gz') &&
            (await verified(path, artifacts.main.sha256))
          )
            await copyFile(path, join(cache, artifacts.main.sha256));
        }
      } else {
        const archive = await download(artifacts.windows);
        progress({ phase: 'installing', progress: { label: 'KataGo', received: 0 } });
        await unpackZip(archive, extracted, signal);
        for (const path of await files(extracted))
          if (/\.(exe|dll)$/i.test(path)) await copyFile(path, join(bin, basename(path)));
      }
      // Keep upstream notices in the local installation alongside the binary.
      const licenseDir = join(staging, 'licenses');
      await mkdir(licenseDir);
      for (const path of await files(extracted))
        if (/^(LICENSE|COPYING|COPYRIGHT|NOTICE)/i.test(basename(path)))
          await copyFile(path, join(licenseDir, relative(extracted, path).replace(/[/\\]/g, '_')));
      await rm(extracted, { recursive: true, force: true });
      const list = (await files(staging)).map((path) => relative(staging!, path));
      if (
        !list.includes(platform.key === 'darwin-arm64' ? 'bin/katago' : join('bin', 'katago.exe'))
      )
        throw new Error('下载包中缺少 KataGo 可执行文件');
      const checksums: Record<string, string> = {};
      for (const path of list)
        checksums[path.replace(/\\/g, '/')] = await fileHash(join(staging, path));
      await writeFile(join(staging, 'installed.json'), JSON.stringify({ files: checksums }));
      signal.throwIfAborted();
      await rm(target, { recursive: true, force: true });
      await rename(staging, target);
      staging = undefined;
    }
    for (const artifact of [artifacts.main, artifacts.human]) {
      await ensureModel(
        artifact,
        directory,
        process.env.GO_TRAINER_BUNDLED_MODELS,
        signal,
        (value) => progress({ phase: 'downloading', progress: value }),
      );
    }
    signal.throwIfAborted();
    return runtime();
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await unlock();
  }
}

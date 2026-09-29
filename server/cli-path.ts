import { constants } from 'node:fs';
import { access, open, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import type { ProviderConfig } from './providers';

export function expandCliPath(value: string) {
  return value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
}

async function findFile(value: string, env: NodeJS.ProcessEnv, executable: boolean) {
  const path = expandCliPath(value);
  if (/\.(cmd|bat)$/i.test(path)) throw new Error('请使用原生 CLI 或 Node + JS 入口');
  const paths = isAbsolute(path)
    ? [path]
    : (env.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .flatMap((directory) => [
          join(directory, path),
          ...(process.platform === 'win32' ? [join(directory, path + '.exe')] : []),
        ]);
  for (const candidate of paths) {
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, executable ? constants.X_OK : constants.R_OK);
      return resolve(candidate);
    } catch {
      /* Try the next PATH entry. */
    }
  }
  throw new Error('CLI 路径不可用');
}

async function isNodeScript(path: string) {
  if (/\.[cm]?js$/i.test(await realpath(path))) return true;
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(256);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return /^#![^\r\n]*\bnode(?:\s|$)/.test(buffer.toString('utf8', 0, bytesRead).split('\n')[0]);
  } finally {
    await file.close();
  }
}

// Detection and coaching must use the same interpreter and PATH. GUI launches
// may lack the directory containing both an npm CLI and its Node interpreter.
export async function resolveCliLaunch(provider: 'codex' | 'claude', config: ProviderConfig) {
  const path = expandCliPath(config[`${provider}Path`]);
  const nodePath = expandCliPath(config[`${provider}NodePath`] || '');
  const legacyScript = config[`${provider}Script`];
  const env = { ...process.env };
  const directories = [nodePath, path].filter(isAbsolute).map(dirname);
  const pathKey = Object.keys(env).find((key) =>
    process.platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH',
  );
  const inheritedPath = pathKey ? env[pathKey] : '';
  if (pathKey && pathKey !== 'PATH') delete env[pathKey];
  env.PATH = [
    ...new Set([...directories, ...(inheritedPath ?? '').split(delimiter)].filter(Boolean)),
  ].join(delimiter);
  delete env.DEEPSEEK_API_KEY;
  delete env.GO_TRAINER_TOKEN;
  if (legacyScript) {
    return {
      executable: await findFile(nodePath || path, env, true),
      script: await findFile(legacyScript, env, false),
      env,
    };
  }
  const entry = await findFile(path, env, false);
  if (await isNodeScript(entry)) {
    return { executable: await findFile(nodePath || 'node', env, true), script: entry, env };
  }
  await access(entry, constants.X_OK);
  return { executable: entry, script: undefined, env };
}

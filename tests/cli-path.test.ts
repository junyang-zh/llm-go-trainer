import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { callCli, type ProviderConfig } from '../server/providers';
import { probeProviders } from '../server/llm-settings';

const directories: string[] = [];
const config: ProviderConfig = {
  deepseekKey: '',
  deepseekUrl: 'https://api.deepseek.com',
  deepseekModel: 'test',
  codexPath: 'missing-test-cli',
  claudePath: 'missing-test-cli',
  timeout: 3000,
};
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
it('finds Node beside an npm CLI when the GUI PATH is empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cli-bin-'));
  directories.push(dir);
  const entry = join(dir, 'codex');
  await symlink(resolve('tests/fixtures/cli-path.mjs'), entry);
  await symlink(process.execPath, join(dir, process.platform === 'win32' ? 'node.exe' : 'node'));
  vi.stubEnv('PATH', '');
  const selected = { ...config, codexPath: entry };
  expect((await probeProviders(selected, new AbortController().signal)).codex.state).toBe('ready');
  expect(await callCli('codex', selected, '同目录')).toBe('讲解：同目录');
});

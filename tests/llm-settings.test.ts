import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LlmSettings, probeProviders } from '../server/llm-settings';
import type { ProviderConfig } from '../server/providers';
import type { LlmStatus } from '../shared/types';

const config: ProviderConfig = {
  deepseekKey: 'test-env-key',
  deepseekUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-flash',
  codexPath: process.execPath,
  claudePath: process.execPath,
  codexScript: resolve('tests/fixtures/fake-auth.mjs'),
  claudeScript: resolve('tests/fixtures/fake-auth.mjs'),
  timeout: 3000,
};
const availability = (deepseek = false, codex = true, claude = true): LlmStatus['providers'] => ({
  deepseek: { available: deepseek, state: deepseek ? 'ready' : 'unconfigured' },
  codex: { available: codex, state: codex ? 'ready' : 'unauthenticated' },
  claude: { available: claude, state: claude ? 'ready' : 'missing' },
});
const directories: string[] = [];
async function settingsFile() {
  const dir = await mkdtemp(join(tmpdir(), 'go-llm-settings-'));
  directories.push(dir);
  return join(dir, 'llm.json');
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe('LLM settings', () => {
  it('automatically selects available providers and refreshes authentication', async () => {
    const probe = vi.fn().mockResolvedValue(availability());
    const settings = new LlmSettings(config, undefined, probe);
    expect((await settings.resolve()).provider).toBe('codex');
    await settings.status();
    expect(probe).toHaveBeenCalledTimes(1);
    probe.mockResolvedValue(availability(true));
    expect((await settings.refresh()).selected).toBe('deepseek');
    probe.mockResolvedValue(availability(false, false));
    expect((await settings.refresh()).selected).toBe('claude');
    probe.mockResolvedValue(availability(false, false, false));
    expect((await settings.refresh()).selected).toBeNull();
    await expect(settings.resolve()).rejects.toThrow('LLM 不可用');
  });
  it('keeps an explicit selection even when another provider is available', async () => {
    const settings = new LlmSettings(config, undefined, async () => availability());
    expect((await settings.update({ preference: 'deepseek' })).selected).toBe('deepseek');
    await expect(settings.resolve()).rejects.toThrow('LLM 不可用');
    await settings.update({ preference: 'auto' });
    expect((await settings.resolve()).provider).toBe('codex');
  });
  it('persists private credentials and independent model settings across restarts', async () => {
    const file = await settingsFile();
    const probe = async () => availability(true);
    const settings = new LlmSettings(config, file, probe);
    const view = await settings.update({
      deepseek: { apiKey: 'test-app-key', model: 'deepseek-v4-pro', effort: 'max' },
      codex: { model: 'custom-codex-test-model', effort: 'high' },
      claude: { model: 'sonnet', effort: 'medium' },
    });
    expect(view.deepseek).toMatchObject({ keySource: 'app', keyConfigured: true, effort: 'max' });
    expect(JSON.stringify(view)).not.toMatch(/test-app-key|test-env-key/);
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    const restarted = new LlmSettings(config, file, probe);
    await restarted.load();
    const resolved = await restarted.resolve();
    expect(resolved.config).toMatchObject({
      deepseekKey: 'test-app-key',
      deepseekModel: 'deepseek-v4-pro',
      deepseekEffort: 'max',
      codexModel: 'custom-codex-test-model',
      codexEffort: 'high',
      claudeModel: 'sonnet',
      claudeEffort: 'medium',
    });
    await restarted.update({ deepseek: { apiKey: null } });
    expect((await restarted.resolve()).config.deepseekKey).toBe('test-env-key');
    expect((await restarted.view()).deepseek.keySource).toBe('env');
    expect(await readFile(file, 'utf8')).not.toContain('test-app-key');
    // In-flight requests retain their own configuration snapshot.
    expect(resolved.config.deepseekKey).toBe('test-app-key');
  });
  it('serializes overlapping updates without dropping fields', async () => {
    const settings = new LlmSettings(config, await settingsFile(), async () => availability(true));
    await Promise.all([
      settings.update({ deepseek: { apiKey: 'test-saved-key' } }),
      settings.update({ deepseek: { effort: 'low' }, preference: 'claude' }),
    ]);
    expect((await settings.resolve()).config).toMatchObject({
      deepseekKey: 'test-saved-key',
      deepseekEffort: 'low',
    });
    expect((await settings.status()).selected).toBe('claude');
  });
  it('does not forward an existing key to a newly selected API origin', async () => {
    const probe = vi.fn().mockResolvedValue(availability(true));
    const settings = new LlmSettings(config, undefined, probe);
    await expect(
      settings.update({ deepseek: { baseUrl: 'https://other.example' } }),
    ).rejects.toThrow('重新填写');
    expect(probe).not.toHaveBeenCalled();
    const result = await settings.update({
      deepseek: { baseUrl: 'https://other.example/', apiKey: 'test-other-key' },
    });
    expect(result.deepseek.baseUrl).toBe('https://other.example');
    expect(probe.mock.calls[0][0].deepseekKey).toBe('test-other-key');
  });
  it('rejects invalid effort, unsupported Haiku effort and unsafe URLs', async () => {
    const settings = new LlmSettings(config, undefined, async () => availability(true));
    for (const patch of [
      { deepseek: { effort: 'invented' } },
      { deepseek: { baseUrl: 'http://public.example' } },
      { deepseek: { baseUrl: 'https://name:password@example.com' } },
      { deepseek: { apiKey: 'first\nsecond' } },
    ])
      await expect(async () => settings.update(patch)).rejects.toThrow();
    await expect(settings.update({ claude: { model: 'haiku', effort: 'high' } })).rejects.toThrow(
      '不支持',
    );
    expect((await settings.view()).claude.model).toBe('');
  });
  it('keeps active settings intact when disk writes fail', async () => {
    const file = await settingsFile();
    await writeFile(file, 'not a directory');
    const settings = new LlmSettings(config, join(file, 'llm.json'), async () =>
      availability(true),
    );
    await expect(settings.update({ deepseek: { apiKey: 'test-lost-key' } })).rejects.toThrow(
      '无法保存',
    );
    expect((await settings.resolve()).config.deepseekKey).toBe('test-env-key');
  });
  it('reports malformed local config without echoing its content', async () => {
    const file = await settingsFile();
    await writeFile(file, 'test-private-corrupt-file');
    const settings = new LlmSettings(config, file, async () => availability());
    await settings.load();
    expect((await settings.status()).error).toBe('本地 LLM 配置读取失败');
    expect(JSON.stringify(await settings.view())).not.toContain('test-private');
  });
});
describe('availability probes', () => {
  it('checks authentication, not just CLI file existence, without exposing account output', async () => {
    const result = await probeProviders(
      { ...config, deepseekKey: '' },
      new AbortController().signal,
    );
    expect(result.codex.state).toBe('ready');
    expect(result.claude.state).toBe('unauthenticated');
    expect(JSON.stringify(result)).not.toContain('test-account-details');
  });
  it.each([
    [200, { data: [{ id: 'deepseek-flash' }] }, 'ready'],
    [200, { data: [{ id: 'other-model' }] }, 'model-unavailable'],
    [401, { error: 'test-sensitive-error' }, 'unauthenticated'],
    [500, { error: 'test-sensitive-error' }, 'unreachable'],
  ] as const)('checks API authentication and requested model: %s %s', async (code, body, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: code }));
    vi.stubGlobal('fetch', fetch);
    const result = await probeProviders(
      { ...config, codexPath: 'not-installed-test', claudePath: 'test.cmd' },
      new AbortController().signal,
    );
    expect(result.deepseek.state).toBe(state);
    expect(result.codex.state).toBe('missing');
    expect(result.claude.state).toBe('missing');
    expect(fetch.mock.calls[0][0]).toBe('https://api.deepseek.com/models');
    expect(fetch.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer test-env-key' },
    });
    expect(JSON.stringify(result)).not.toContain('test-sensitive-error');
  });
});

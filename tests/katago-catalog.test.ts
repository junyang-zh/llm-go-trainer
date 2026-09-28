import { afterEach, expect, it, vi } from 'vitest';
import { defaultModels, officialModels } from '../server/katago-catalog';
import { fixtureCatalog } from './fixtures/model-library';

afterEach(() => vi.unstubAllGlobals());
it('imports only non-random models with official URLs and valid checksums', async () => {
  const model = fixtureCatalog[0];
  const row = {
    name: model.name,
    network_size: 'b18c384nbt',
    is_random: false,
    model_file: model.url,
    model_file_bytes: model.bytes,
    model_file_sha256: model.sha256,
  };
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          results: [
            row,
            { ...row, is_random: true },
            { ...row, model_file: 'https://127.0.0.1/private.bin.gz' },
            { ...row, model_file_sha256: 'invalid' },
          ],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const models = await officialModels(2);
  expect(models).toHaveLength(1);
  expect(models[0]).toMatchObject({ id: model.id, role: 'main', tier: 'other' });
  expect(fetch).toHaveBeenCalledWith(
    'https://katagotraining.org/api/networks/?page=2',
    expect.objectContaining({ redirect: 'error' }),
  );
});
it('surfaces invalid catalog responses instead of silently installing unknown data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('not JSON')),
  );
  await expect(officialModels(1)).rejects.toThrow();
});
it('provides pinned recommended tiers and a separate HumanSL companion', () => {
  expect(
    defaultModels
      .filter((model) => model.role === 'main')
      .map((model) => model.tier)
      .sort(),
  ).toEqual(['advanced', 'balanced', 'light']);
  expect(defaultModels.filter((model) => model.role === 'human')).toHaveLength(1);
  for (const model of defaultModels) {
    expect(model.id).toBe(model.sha256);
    expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(model.bytes).toBeGreaterThan(0);
  }
});

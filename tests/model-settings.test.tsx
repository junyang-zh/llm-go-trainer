// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ModelSettings } from '../src/ModelSettings';
import type { ModelsView } from '../shared/models';
import { fixtureCatalog } from './fixtures/model-library';

let root: Root, host: HTMLDivElement, view: ModelsView;
const changed = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  view = {
    models: fixtureCatalog.map((model) => ({
      ...model,
      installed: true,
      diskBytes: model.bytes!,
      phase: 'installed',
    })),
    selected: { main: fixtureCatalog[0].id, human: fixtureCatalog[2].id },
    storageBytes: 100,
    canSelect: true,
  };
  changed.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/status'))
        return new Response(
          JSON.stringify({
            engine: { phase: 'starting', configured: true, running: true, humanModel: true },
          }),
        );
      if (url.endsWith('/models/select')) view.pending = JSON.parse(options!.body as string);
      return new Response(JSON.stringify(view));
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = (busy = false) =>
  act(async () =>
    root.render(
      <ModelSettings
        status={{
          configured: true,
          running: true,
          ready: true,
          humanModel: true,
          mode: 'managed',
          phase: 'ready',
        }}
        onChange={changed}
        busy={busy}
      >
        <div>引擎控制</div>
      </ModelSettings>,
    ),
  );
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((button) => button.textContent === label)!;
it('shows downloaded models and sends a selection without redownloading', async () => {
  await render();
  expect(host.textContent).toContain('轻量快速');
  expect(host.querySelectorAll('article')).toHaveLength(3);
  await act(async () => button('使用此模型').click());
  expect(fetch).toHaveBeenCalledWith(
    '/api/models/select',
    expect.objectContaining({
      body: JSON.stringify({ main: fixtureCatalog[1].id, human: fixtureCatalog[2].id }),
    }),
  );
  expect(changed).toHaveBeenCalled();
  expect(host.textContent).toContain('正在验证');
  expect(button('使用此模型').disabled).toBe(true);
});
it('blocks selection during analysis and only deletes after the inline confirmation', async () => {
  await render(true);
  expect(button('使用此模型').disabled).toBe(true);
  await act(async () => button('删除').click());
  expect(fetch).not.toHaveBeenCalledWith('/api/models/delete', expect.anything());
  await act(async () => button('确认删除').click());
  expect(fetch).toHaveBeenCalledWith(
    '/api/models/delete',
    expect.objectContaining({ body: JSON.stringify({ id: fixtureCatalog[1].id }) }),
  );
});
it('offers retries for failed downloads and keeps catalog refresh errors visible', async () => {
  view.models[1] = {
    ...view.models[1],
    installed: false,
    diskBytes: 0,
    phase: 'error',
    error: 'Checksum failed',
  };
  await render();
  expect(host.textContent).toContain('Checksum failed');
  await act(async () => button('重新下载').click());
  expect(fetch).toHaveBeenCalledWith('/api/models/download', expect.anything());
  vi.mocked(fetch).mockImplementationOnce(
    async () => new Response(JSON.stringify({ error: '官方目录暂时不可用' }), { status: 502 }),
  );
  await act(async () => button('获取最新官方模型').click());
  expect(host.textContent).toContain('官方目录暂时不可用');
  expect(host.querySelectorAll('article')).toHaveLength(3);
});

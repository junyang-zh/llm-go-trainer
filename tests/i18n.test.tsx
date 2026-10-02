import { displayModelName } from '../src/ui-labels';
import { defaultModels } from '../server/katago-catalog';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  catalogs,
  getLanguagePreference,
  getLocale,
  localizeDiagnostic,
  languageStorageKey,
  locales,
  resolveLocale,
  setLanguage,
  t,
  translate,
  type MessageKey,
} from '../src/i18n';
import App from '../src/App';
import { engineLabel } from '../src/EngineSettings';
import { api, streamApi } from '../src/api';
import { evaluation, testStatus } from './fixtures/evaluation';
vi.mock('../src/api', () => ({ api: vi.fn(), streamApi: vi.fn() }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  vi.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(api).mockImplementation(async (path) =>
    path === 'library'
      ? { games: [], conversations: [] }
      : {
          ...testStatus,
          llm: {
            ...testStatus.llm!,
            selected: 'codex',
            providers: { ...testStatus.llm!.providers, codex: { available: true, state: 'ready' } },
          },
        },
  );
  vi.mocked(streamApi).mockImplementation(async (_path, body, onEvent) => {
    onEvent({
      type: 'done',
      analysis: evaluation((body as { game: { moves: unknown[] } }).game.moves.length),
    });
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
it('resolves system scripts, regions, preference order and unsupported languages', () => {
  expect(getLanguagePreference()).toBe('system');
  for (const [tags, expected] of [
    [['zh-Hans-HK'], 'zh-CN'],
    [['zh-Hant-CN'], 'zh-TW'],
    [['zh-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-MO'], 'zh-TW'],
    [['zh-SG'], 'zh-CN'],
    [['ja-JP'], 'ja'],
    [['ko-KR'], 'ko'],
    [['en-GB'], 'en'],
    [['fr-FR', 'ko-KR'], 'ko'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ] as const)
    expect(resolveLocale(tags)).toBe(expected);
  localStorage.setItem(languageStorageKey, 'invalid');
  expect(getLanguagePreference()).toBe('system');
});
it('has a complete catalog and matching interpolation fields for all five languages', () => {
  const fields = (value: string) => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();
  for (const locale of locales) {
    expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
    for (const key of Object.keys(catalogs.en) as MessageKey[]) {
      expect(catalogs[locale][key].trim(), `${locale}: ${key}`).not.toBe('');
      expect(fields(catalogs[locale][key]), `${locale}: ${key}`).toEqual(fields(catalogs.en[key]));
    }
    expect(
      translate(locale, 'defaultGameTitle', { black: '{white}', white: '<script>', size: 19 }),
    ).toContain('{white}');
  }
});
it('localizes shared-rule diagnostics without changing the rules or unknown provider output', () => {
  setLanguage('en');
  expect(localizeDiagnostic('这里已有棋子')).toBe('This point is occupied');
  expect(localizeDiagnostic('无效坐标：Z99')).toBe('Invalid coordinate: Z99');
  expect(localizeDiagnostic('provider error 123')).toBe('provider error 123');
  for (const model of defaultModels) expect(displayModelName(model)).not.toMatch(/[\u3400-\u9fff]/);
  expect(displayModelName({ ...defaultModels[0], name: '我的模型' })).toBe('我的模型');
});
it('switches all languages without remounting the game, closing the panel or resetting a draft', async () => {
  await act(async () => root.render(<App />));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  await act(async () =>
    (host.querySelector('[data-board-point="Q4"]') as SVGElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(200));
  const board = host.querySelector('.go-board');
  await act(async () => (host.querySelector('.evaluation-toggle') as HTMLButtonElement).click());
  await act(async () => (host.querySelector('.quick-actions button') as HTMLButtonElement).click());
  const draft = host.querySelector('textarea')!.value;
  await act(async () => (host.querySelector('.settings-trigger') as HTMLButtonElement).click());
  for (const locale of locales) {
    const selector = host.querySelector('.general-settings select') as HTMLSelectElement;
    await act(async () => {
      selector.value = locale;
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.documentElement.lang).toBe(locale);
    expect(getLanguagePreference()).toBe(locale);
    expect(localStorage.getItem(languageStorageKey)).toBe(locale);
    expect(host.querySelector('.general-settings h3')?.textContent).toBe(
      translate(locale, 'appUpdates'),
    );
    expect(host.querySelector('.quick-actions button')?.textContent).toBe(
      translate(locale, 'explainThisMove'),
    );
    expect(host.querySelector('.evaluation-toggle')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.go-board')).toBe(board);
    expect(host.querySelector('.timeline')?.getAttribute('value')).toBe('1');
    expect(host.querySelector('textarea')!.value).toBe(draft);
    expect(host.querySelector('.evaluation-toggle .evaluation-current')?.textContent).toContain(
      '20.0%',
    );
    expect(host.querySelector('.evaluation-search')).toBeNull();
    expect(host.querySelector('.workspace-status')?.textContent).toContain(
      translate(locale, 'curveAnalysisComplete', { v0: 1, v1: '' }),
    );
    expect(host.querySelector('.evaluation-candidates .candidates')).not.toBeNull();
  }
  await act(async () =>
    (host.querySelector('.dialog-toolbar button') as HTMLButtonElement).click(),
  );
  await act(async () => (host.querySelector('.evaluation-toggle') as HTMLButtonElement).click());
  expect(host.querySelector('.evaluation-current')).toBeNull();
  expect(host.querySelector('.evaluation-candidates')).toBeNull();
  await act(async () =>
    (host.querySelector('.chat-input button.primary') as HTMLButtonElement).click(),
  );
  const request = vi.mocked(streamApi).mock.calls.find((call) => call[0] === 'coach');
  expect(request?.[1]).toMatchObject({ action: 'move', question: '' });
});
it('follows system changes only in system mode, and restores a saved selection on remount', async () => {
  await act(async () => root.render(<App />));
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
  await act(async () => window.dispatchEvent(new Event('languagechange')));
  expect(document.documentElement.lang).toBe('ja');
  await act(async () => setLanguage('ko'));
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  await act(async () => window.dispatchEvent(new Event('languagechange')));
  expect(getLocale()).toBe('ko');
  await act(async () => root.render(null));
  await act(async () => root.render(<App />));
  expect(host.querySelector('.quick-actions button')?.textContent).toBe(t('explainThisMove'));
  expect(document.documentElement.lang).toBe('ko');
  await act(async () => setLanguage('system'));
  expect(document.documentElement.lang).toBe('en');
  await act(async () => {
    localStorage.setItem(languageStorageKey, 'zh-TW');
    window.dispatchEvent(new StorageEvent('storage', { key: languageStorageKey }));
  });
  expect(document.documentElement.lang).toBe('zh-TW');
});

it('translates runtime notices, nested model errors and progress in every language without altering diagnostics', () => {
  const download =
    'KataGo 主模型 下载失败（katagotraining.org）：下载失败 HTTP 503：katagotraining.org';
  for (const locale of locales) {
    setLanguage(locale);
    expect(localizeDiagnostic(download)).toBe(
      t('runtimeArtifactDownload', {
        artifact: t('runtimeMainArtifact'),
        host: 'katagotraining.org',
        detail: t('runtimeDownloadHttp', { status: 503, host: 'katagotraining.org' }),
      }),
    );
    expect(localizeDiagnostic('HumanSL 5k 概率采样（棋风近似）')).toBe(
      t('runtimeHumanSampling', { rank: '5k' }),
    );
    expect(localizeDiagnostic('请先下载并校验 我的模型')).toBe(
      t('runtimeDownloadModelFirst', { model: '我的模型' }),
    );
    expect(localizeDiagnostic('模型设置读取失败，已恢复默认选择；已下载的文件仍保留。')).toBe(
      t('runtimeModelSettingsRecovered'),
    );
    expect(
      localizeDiagnostic(
        'KataGo 已退出 (-1)。缺少运行库 DLL，请重新安装后端或检查 NVIDIA 驱动。E123',
      ),
    ).toBe(
      t('runtimeKatagoExitDetail', {
        code: -1,
        detail: t('runtimeMissingDllDetail', { detail: 'E123' }),
      }),
    );
    expect(localizeDiagnostic('Codex 正在搜索网页')).toBe(
      t('runtimeProviderSearch', { provider: 'Codex' }),
    );
    expect(localizeDiagnostic('已达到最长用时，分析已超时')).toBe(t('runtimeBudgetTime'));
    expect(localizeDiagnostic(translate('ko', 'trialMissing'))).toBe(t('trialMissing'));
    expect(localizeDiagnostic('工具执行失败\nprovider error E123')).toBe(
      t('runtimeToolFailed') + '\nprovider error E123',
    );
    expect(
      engineLabel({
        ...testStatus.engine,
        phase: 'starting',
        progress: { label: '正在进行 OpenCL 调优；首次启动可能需要数分钟，请稍候', received: 0 },
      }),
    ).toContain(t('runtimeOpenclTuning'));
  }
});
it('rerenders an existing engine error and model notice when changing language', async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === 'library') return { games: [], conversations: [] };
    if (path === 'models')
      return {
        canSelect: true,
        storageBytes: 0,
        selected: { main: defaultModels[0].id, human: null },
        notice: '模型设置读取失败，已恢复默认选择；已下载的文件仍保留。',
        models: [
          {
            ...defaultModels[0],
            installed: false,
            phase: 'error',
            error: '下载失败 HTTP 503：katagotraining.org',
          },
        ],
      };
    return {
      ...testStatus,
      engine: {
        ...testStatus.engine,
        ready: false,
        phase: 'error',
        error: '当前模型不适用于 9 路棋盘，请在模型设置中选择支持该尺寸的模型',
      },
    };
  });
  await act(async () => root.render(<App />));
  await act(async () => (host.querySelector('.settings-trigger') as HTMLButtonElement).click());
  await act(async () =>
    (host.querySelectorAll('.settings-tabs button')[1] as HTMLButtonElement).click(),
  );
  for (const locale of locales) {
    await act(async () => setLanguage(locale));
    expect(host.querySelector('.workspace-status')?.textContent).toBe(
      t('runtimeUnsupportedBoard', { size: 9 }),
    );
    expect(host.querySelector('.model-notice')?.textContent).toBe(
      t('runtimeModelSettingsRecovered'),
    );
    expect(host.querySelector('.katago-model-card .error')?.textContent).toBe(
      t('runtimeDownloadHttp', { status: 503, host: 'katagotraining.org' }),
    );
  }
});
it('keeps AI move and curve completion notices reactive to language changes', async () => {
  vi.mocked(streamApi).mockImplementation(async (path, body, onEvent) => {
    const analysis = evaluation((body as { game: { moves: unknown[] } }).game.moves.length);
    onEvent(
      path === 'bot-move'
        ? { type: 'done', analysis, move: 'D4', method: 'HumanSL 5k 概率采样（棋风近似）' }
        : { type: 'done', analysis },
    );
  });
  await act(async () => root.render(<App />));
  await act(async () =>
    (host.querySelector('[data-board-point="Q4"]') as SVGElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    ),
  );
  await act(async () =>
    (host.querySelector('.auto-play-toggle input') as HTMLInputElement).click(),
  );
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(vi.mocked(streamApi).mock.calls.some(([path]) => path === 'bot-move')).toBe(true);
  for (const locale of locales) {
    await act(async () => setLanguage(locale));
    expect(host.querySelector('.workspace-status')?.textContent).toContain(
      t('runtimeHumanSampling', { rank: '5k' }),
    );
    expect(host.querySelector('.workspace-status')?.textContent).toContain(
      t('visits', { v0: '100', v1: '' }),
    );
    expect(host.querySelector('.timeline')?.getAttribute('value')).toBe('2');
  }
  await act(async () => vi.advanceTimersByTimeAsync(200));
  for (const locale of locales) {
    await act(async () => setLanguage(locale));
    expect(host.querySelector('.workspace-status')?.textContent).toContain(
      t('curveAnalysisComplete', { v0: 2, v1: '' }),
    );
  }
});

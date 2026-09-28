import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EngineStatus } from '../shared/types';
import type { ModelEntry, ModelsView, ModelTier } from '../shared/models';
import { api } from './api';

const tiers: Record<ModelTier, string> = {
  light: '轻量快速',
  balanced: '日常均衡',
  advanced: '进阶分析',
  other: '其他模型',
  human: '人类棋风',
};
export function modelBytes(bytes?: number) {
  if (bytes === undefined) return '大小待获取';
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function ModelSettings({
  status,
  onChange,
  busy = false,
  children,
}: {
  status?: EngineStatus;
  onChange: (status: EngineStatus) => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const [view, setView] = useState<ModelsView>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const [filter, setFilter] = useState('recommended');
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [page, setPage] = useState(1);
  const sequence = useRef(0);
  useEffect(() => {
    let active = true,
      reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      const current = ++sequence.current;
      try {
        const value = await api<ModelsView>('models');
        if (active && current === sequence.current) setView(value);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function action(name: string, body: unknown = {}) {
    setWorking(name);
    setError('');
    sequence.current++;
    try {
      const next = await api<ModelsView>(`models/${name}`, body);
      sequence.current++;
      setView(next);
      if (name === 'select') onChange((await api<{ engine: EngineStatus }>('status')).engine);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setWorking('');
    }
  }
  const selected = view?.models.find((model) => model.id === view.selected.main);
  const pending = view?.models.find((model) => model.id === view.pending?.main);
  const canSelect =
    !!view?.canSelect && status?.mode !== 'external' && !view.pending && !busy && !working;
  const matches = (model: ModelEntry) =>
    `${model.name} ${model.architecture}`.toLowerCase().includes(query.toLowerCase());
  const visible =
    view?.models.filter(
      (model) =>
        matches(model) &&
        (filter === 'all' ||
          (filter === 'downloaded' && model.installed) ||
          (filter === 'recommended' && model.tier !== 'other') ||
          filter === model.tier),
    ) ?? [];
  async function useModel(model: ModelEntry) {
    if (!view) return;
    await action(
      'select',
      model.role === 'human'
        ? { ...view.selected, human: model.id }
        : { ...view.selected, main: model.id },
    );
  }
  function card(model: ModelEntry) {
    const active = model.id === view?.selected.main || model.id === view?.selected.human;
    const changing = model.id === view?.pending?.main || model.id === view?.pending?.human;
    const downloading = ['queued', 'downloading'].includes(model.phase);
    const percent = model.total
      ? Math.min(100, Math.round(((model.received ?? 0) / model.total) * 100))
      : undefined;
    const companionReady =
      model.role === 'human'
        ? selected?.installed
        : !view?.selected.human ||
          view.models.find((entry) => entry.id === view.selected.human)?.installed;
    return (
      <article
        key={model.id}
        className={`katago-model-card ${active ? 'active-model' : ''}`}
        aria-label={model.name}
      >
        <div className="model-card-heading">
          <span className={`model-tier tier-${model.tier}`}>{tiers[model.tier]}</span>
          <span className="model-badge">
            {changing ? '验证中' : active ? '已选用' : model.installed ? '已下载' : '未下载'}
          </span>
        </div>
        <h4>{model.name}</h4>
        <div className="model-metadata">
          {model.architecture} · {modelBytes(model.bytes || model.diskBytes)} ·{' '}
          {model.boards.join(' / ')} 路
        </div>
        {downloading && (
          <div className="model-download-progress" role="status">
            <span>
              {model.phase === 'queued' ? '排队中' : '下载中'}
              {percent !== undefined ? ` · ${percent}%` : ''}
            </span>
            <progress
              aria-label={`${model.name} 下载进度`}
              max={model.total || undefined}
              value={model.total ? (model.received ?? 0) : undefined}
            />
            <small>
              {modelBytes(model.received)} / {modelBytes(model.total)}
            </small>
          </div>
        )}
        {model.error && (
          <p className="error" role="alert">
            {model.error}
          </p>
        )}
        <div className="model-card-actions">
          {downloading ? (
            <button disabled={!!working} onClick={() => void action('cancel', { id: model.id })}>
              取消下载
            </button>
          ) : !model.installed ? (
            <button
              className="primary"
              disabled={!!working}
              onClick={() => void action('download', { id: model.id })}
            >
              {model.phase === 'error' || model.phase === 'canceled' ? '重新下载' : '下载模型'}
            </button>
          ) : !active ? (
            <button
              className="primary"
              disabled={!canSelect || !companionReady}
              onClick={() => void useModel(model)}
            >
              使用此模型
            </button>
          ) : null}
          {model.diskBytes > 0 && !active && !changing && (
            <button disabled={!!working} onClick={() => setConfirmDelete(model.id)}>
              删除
            </button>
          )}
          <a href={model.source} target="_blank" rel="noreferrer">
            来源 ↗
          </a>
        </div>
        {confirmDelete === model.id && (
          <div className="model-delete-confirm" role="alert">
            <p>删除本地模型，释放 {modelBytes(model.diskBytes)}？</p>
            <button
              disabled={!!working}
              onClick={() =>
                void action('delete', { id: model.id }).then((ok) => {
                  if (ok) setConfirmDelete(undefined);
                })
              }
            >
              确认删除
            </button>
            <button disabled={!!working} onClick={() => setConfirmDelete(undefined)}>
              保留
            </button>
          </div>
        )}
        <details className="model-file-details">
          <summary>文件详情</summary>
          <p>{model.url.split('/').at(-1)}</p>
          <code>SHA-256 {model.sha256}</code>
        </details>
      </article>
    );
  }
  return (
    <section className="katago-model-settings" aria-label="KataGo 模型管理">
      {children}
      <header className="models-heading">
        <h3>模型</h3>
        <span className="model-storage">
          本地模型 {view ? modelBytes(view.storageBytes) : '读取中…'}
        </span>
      </header>
      <div className="model-active-summary">
        <div>
          <span className="model-eyebrow">当前分析模型</span>
          <strong>{selected?.name || '读取模型设置…'}</strong>
        </div>
        <label>
          人类棋风模型
          <select
            aria-label="人类棋风模型"
            value={view?.selected.human ?? ''}
            disabled={!canSelect || !selected?.installed}
            onChange={(event) =>
              void action('select', {
                main: view!.selected.main,
                human: event.target.value || null,
              })
            }
          >
            <option value="">关闭 HumanSL</option>
            {view?.models
              .filter((model) => model.role === 'human')
              .map((model) => (
                <option key={model.id} value={model.id} disabled={!model.installed}>
                  {model.name}
                  {!model.installed ? '（需先下载）' : ''}
                </option>
              ))}
          </select>
        </label>
      </div>
      {pending && (
        <p className="model-notice" role="status">
          正在验证 {pending.name}…
        </p>
      )}
      {busy && <p className="model-notice">分析中，暂不可切换模型。</p>}
      {view && !view.canSelect && (
        <p className="model-notice">
          当前使用 .env 自定义引擎。可管理下载；移除 KATAGO_MODEL 配置后可在此切换模型。
        </p>
      )}
      {status?.mode === 'external' && (
        <p className="model-notice">切换到 KataGo 后可选择本地模型。</p>
      )}
      {view?.notice && <p className="model-notice">{view.notice}</p>}
      <div className="model-browser-toolbar">
        <div className="model-filters" role="group" aria-label="筛选模型">
          {[
            ['recommended', '推荐'],
            ['downloaded', '已下载'],
            ['all', '全部'],
          ].map(([value, name]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value)}
            >
              {name}
            </button>
          ))}
        </div>
        <input
          aria-label="搜索模型"
          placeholder="搜索名称或网络结构"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!view ? (
        <p role="status">正在读取本地模型…</p>
      ) : (
        <div className="katago-model-grid">{visible.map(card)}</div>
      )}
      {view && !visible.length && <p className="model-empty">没有符合条件的模型</p>}
      <div className="model-catalog-actions">
        <button
          disabled={!!working}
          onClick={() =>
            void action('refresh', { page: 1 }).then((ok) => {
              if (ok) {
                setPage(1);
                setFilter('all');
              }
            })
          }
        >
          {working === 'refresh' ? '正在读取官方目录…' : '获取最新官方模型'}
        </button>
        {view?.catalogUpdatedAt && (
          <button
            disabled={!!working}
            onClick={() =>
              void action('refresh', { page: page + 1 }).then((ok) => {
                if (ok) {
                  setPage(page + 1);
                  setFilter('all');
                }
              })
            }
          >
            加载更早的模型
          </button>
        )}
        <span>
          {view?.catalogUpdatedAt
            ? `目录更新于 ${new Date(view.catalogUpdatedAt).toLocaleDateString()}`
            : ''}
        </span>
      </div>
      <details className="model-custom">
        <summary>添加其他模型</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void action('add', {
              name: data.get('name'),
              url: data.get('url'),
              sha256: data.get('sha256'),
              role: data.get('role'),
              boards: data.getAll('boards').map(Number),
            }).then((ok) => {
              if (ok) {
                form.reset();
                setFilter('all');
              }
            });
          }}
        >
          <div className="model-form-grid">
            <label>
              模型名称
              <input name="name" required maxLength={120} />
            </label>
            <label>
              模型用途
              <select name="role">
                <option value="main">主分析模型</option>
                <option value="human">HumanSL 棋风模型</option>
              </select>
            </label>
          </div>
          <label>
            官方 HTTPS 下载链接
            <input
              name="url"
              type="url"
              required
              placeholder="https://media.katagotraining.org/…/model.bin.gz"
            />
          </label>
          <label>
            SHA-256
            <input
              name="sha256"
              required
              pattern="[a-fA-F0-9]{64}"
              maxLength={64}
              spellCheck={false}
            />
          </label>
          <fieldset className="model-board-options">
            <legend>模型适用的棋盘</legend>
            {[9, 13, 19].map((size) => (
              <label key={size}>
                <input type="checkbox" name="boards" value={size} defaultChecked />
                {size} 路
              </label>
            ))}
          </fieldset>
          <button disabled={!!working} type="submit">
            添加到模型库
          </button>
        </form>
      </details>
    </section>
  );
}

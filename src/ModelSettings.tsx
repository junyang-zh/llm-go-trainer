import { displayModelName } from './ui-labels';
import { t, localizeDiagnostic, formatDateOnly } from './i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EngineStatus } from '../shared/types';
import type { ModelEntry, ModelsView, ModelTier } from '../shared/models';
import { api } from './api';

export function modelBytes(bytes?: number) {
  if (bytes === undefined) return t('sizeUnknown');
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
  const tiers: Record<ModelTier, string> = {
    light: t('lightAndFast'),
    balanced: t('balanced'),
    advanced: t('advancedAnalysis'),
    other: t('otherModels'),
    human: t('humanStyle'),
  };
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
    `${model.name} ${displayModelName(model)} ${model.architecture}`
      .toLowerCase()
      .includes(query.toLowerCase());
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
        aria-label={displayModelName(model)}
      >
        <div className="model-card-heading">
          <span className={`model-tier tier-${model.tier}`}>{tiers[model.tier]}</span>
          <span className="model-badge">
            {changing
              ? t('validating')
              : active
                ? t('selected')
                : model.installed
                  ? t('downloaded')
                  : t('notDownloaded')}
          </span>
        </div>
        <h4>{displayModelName(model)}</h4>
        <div className="model-metadata">
          {t('modelMetadata', {
            v0: localizeDiagnostic(model.architecture),
            v1: modelBytes(model.bytes || model.diskBytes),
            v2: model.boards.join(' / '),
          })}
        </div>
        {downloading && (
          <div className="model-download-progress" role="status">
            <span>
              {model.phase === 'queued' ? t('queued') : t('downloading')}
              {percent !== undefined ? ` · ${percent}%` : ''}
            </span>
            <progress
              aria-label={t('modelDownloadProgress', { v0: displayModelName(model) })}
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
            {localizeDiagnostic(model.error)}
          </p>
        )}
        <div className="model-card-actions">
          {downloading ? (
            <button disabled={!!working} onClick={() => void action('cancel', { id: model.id })}>
              {t('cancelDownload')}
            </button>
          ) : !model.installed ? (
            <button
              className="primary"
              disabled={!!working}
              onClick={() => void action('download', { id: model.id })}
            >
              {model.phase === 'error' || model.phase === 'canceled'
                ? t('downloadAgain')
                : t('downloadModel')}
            </button>
          ) : !active ? (
            <button
              className="primary"
              disabled={!canSelect || !companionReady}
              onClick={() => void useModel(model)}
            >
              {t('useThisModel')}
            </button>
          ) : null}
          {model.diskBytes > 0 && !active && !changing && (
            <button disabled={!!working} onClick={() => setConfirmDelete(model.id)}>
              {t('delete')}
            </button>
          )}
          <a href={model.source} target="_blank" rel="noreferrer">
            {t('source')}
          </a>
        </div>
        {confirmDelete === model.id && (
          <div className="model-delete-confirm" role="alert">
            <p>{t('deleteModelConfirmation', { v0: modelBytes(model.diskBytes) })}</p>
            <button
              disabled={!!working}
              onClick={() =>
                void action('delete', { id: model.id }).then((ok) => {
                  if (ok) setConfirmDelete(undefined);
                })
              }
            >
              {t('confirmDeletion')}
            </button>
            <button disabled={!!working} onClick={() => setConfirmDelete(undefined)}>
              {t('keep')}
            </button>
          </div>
        )}
        <details className="model-file-details">
          <summary>{t('fileDetails')}</summary>
          <p>{model.url.split('/').at(-1)}</p>
          <code>SHA-256 {model.sha256}</code>
        </details>
      </article>
    );
  }
  return (
    <section className="katago-model-settings" aria-label={t('katagoModelManager')}>
      {children}
      <header className="models-heading">
        <h3>{t('model')}</h3>
        <span className="model-storage">
          {t('localModels', { v0: view ? modelBytes(view.storageBytes) : t('loading') })}
        </span>
      </header>
      <div className="model-active-summary">
        <div>
          <span className="model-eyebrow">{t('currentAnalysisModel')}</span>
          <strong>{selected ? displayModelName(selected) : t('readingModelSettings')}</strong>
        </div>
        <label>
          {t('humanStyleModel')}
          <select
            aria-label={t('humanStyleModel')}
            value={view?.selected.human ?? ''}
            disabled={!canSelect || !selected?.installed}
            onChange={(event) =>
              void action('select', {
                main: view!.selected.main,
                human: event.target.value || null,
              })
            }
          >
            <option value="">{t('disableHumansl')}</option>
            {view?.models
              .filter((model) => model.role === 'human')
              .map((model) => (
                <option key={model.id} value={model.id} disabled={!model.installed}>
                  {displayModelName(model)}
                  {!model.installed ? t('downloadFirst') : ''}
                </option>
              ))}
          </select>
        </label>
      </div>
      {pending && (
        <p className="model-notice" role="status">
          {t('validatingModel', { v0: displayModelName(pending) })}
        </p>
      )}
      {busy && <p className="model-notice">{t('modelsCannotBeSwitchedDuringAnalysis')}</p>}
      {view && !view.canSelect && <p className="model-notice">{t('customEngineModelsHelp')}</p>}
      {status?.mode === 'external' && (
        <p className="model-notice">{t('switchToKatagoToSelectLocalModels')}</p>
      )}
      {view?.notice && <p className="model-notice">{localizeDiagnostic(view.notice)}</p>}
      <div className="model-browser-toolbar">
        <div className="model-filters" role="group" aria-label={t('filterModels')}>
          {[
            ['recommended', t('recommended')],
            ['downloaded', t('downloaded')],
            ['all', t('all')],
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
          aria-label={t('searchModels')}
          placeholder={t('searchNameOrArchitecture')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {localizeDiagnostic(error)}
        </p>
      )}
      {!view ? (
        <p role="status">{t('readingLocalModels')}</p>
      ) : (
        <div className="katago-model-grid">{visible.map(card)}</div>
      )}
      {view && !visible.length && <p className="model-empty">{t('noMatchingModels')}</p>}
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
          {working === 'refresh' ? t('readingOfficialCatalog') : t('getLatestOfficialModels')}
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
            {t('loadEarlierModels')}
          </button>
        )}
        <span>
          {view?.catalogUpdatedAt
            ? t('catalogUpdated', { v0: formatDateOnly(view.catalogUpdatedAt) })
            : ''}
        </span>
      </div>
      <details className="model-custom">
        <summary>{t('addAnotherModel')}</summary>
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
              {t('modelName')}
              <input name="name" required maxLength={120} />
            </label>
            <label>
              {t('modelPurpose')}
              <select name="role">
                <option value="main">{t('mainAnalysisModel')}</option>
                <option value="human">{t('humanslStyleModel')}</option>
              </select>
            </label>
          </div>
          <label>
            {t('officialHttpsDownloadUrl')}
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
            <legend>{t('supportedBoardSizes')}</legend>
            {[9, 13, 19].map((size) => (
              <label key={size}>
                <input type="checkbox" name="boards" value={size} defaultChecked />
                {t('boardSize', { v0: size })}
              </label>
            ))}
          </fieldset>
          <button disabled={!!working} type="submit">
            {t('addToModelLibrary')}
          </button>
        </form>
      </details>
    </section>
  );
}

import { RecordDownloader } from './RecordDownloader';
import { FoxRecords } from './FoxRecords';
import { useEffect, useState } from 'react';
import {
  matchesRecord,
  recordGroupId,
  type RecordCategory,
  type SavedGame,
} from '../shared/library';
import { summarizeRecord, type RecordPage, type RecordSummary } from '../shared/presets';
import { t, formatDate, localizeDiagnostic, type MessageKey } from './i18n';
import { api } from './api';

const categories: Record<RecordCategory, MessageKey> = {
  history: 'recordsHistory',
  famous: 'recordsFamous',
  joseki: 'recordsJoseki',
  tsumego: 'recordsTsumego',
};
const pageSize = 20;
export function RecordLibrary({
  games,
  selectedId,
  disabled,
  onImport,
  onSelect,
  onExport,
  onRename,
}: {
  games: SavedGame[];
  selectedId: string;
  disabled: boolean;
  onImport: () => void;
  onSelect: (record: SavedGame, warnings?: string[]) => void;
  onExport: (record: SavedGame) => void;
  onRename: (id: string, title: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<RecordCategory>('history');
  const [downloads, setDownloads] = useState(false);
  const [fox, setFox] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<RecordPage>({ total: 0, games: [] });
  const [roots, setRoots] = useState<RecordSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (category !== 'famous') return;
    let active = true;
    setLoading(true);
    setError('');
    setPage({ total: 0, games: [] });
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        query,
        offset: String(offset),
        limit: String(pageSize),
      });
      void api<RecordPage>(`library/presets?${params}`)
        .then((result) => {
          if (active) setPage(result);
        })
        .catch((err) => {
          if (active) setError((err as Error).message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [category, query, offset, revision]);
  const rootIds = [...new Set(games.filter((item) => item.sourceId).map(recordGroupId))]
    .filter((id) => id.startsWith('c0000000-'))
    .sort()
    .join(',');
  useEffect(() => {
    let active = true;
    void Promise.all(
      rootIds
        .split(',')
        .filter(Boolean)
        .map((id) => api<RecordSummary>(`library/presets/${id}/summary`).catch(() => undefined)),
    )
      .then((result) => {
        if (active) setRoots(result.filter((item): item is RecordSummary => !!item));
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [rootIds, revision]);
  const all = [
    ...games.map(summarizeRecord),
    ...roots.filter((root) => !games.some((game) => game.id === root.id)),
  ];
  const history = games
    .filter((item) => !item.preset && matchesRecord(item, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(summarizeRecord);
  const items =
    category === 'history'
      ? history.slice(offset, offset + pageSize)
      : category === 'famous'
        ? page.games
        : [];
  const total = category === 'history' ? history.length : category === 'famous' ? page.total : 0;
  const groups = new Map<string, RecordSummary[]>();
  for (const item of items) {
    const id = recordGroupId(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  async function open(item: RecordSummary) {
    setOpening(true);
    setError('');
    try {
      const record =
        games.find((game) => game.id === item.id) ??
        (await api<SavedGame>(`library/presets/${item.id}`));
      onSelect(record);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(false);
    }
  }
  async function download(item: RecordSummary) {
    setError('');
    try {
      const local = games.find((game) => game.id === item.id);
      if (local) {
        onExport(local);
        return;
      }
      const { sgf } = await api<{ sgf: string }>(`library/presets/${item.id}/sgf`);
      const url = URL.createObjectURL(new Blob([sgf], { type: 'application/x-go-sgf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.title.replace(/[\\/:*?"<>|]/g, '_')}.sgf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function rename(id: string) {
    setRenaming(true);
    setError('');
    try {
      await onRename(id, name.trim());
      setEditing(undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenaming(false);
    }
  }
  return (
    <div className="record-library">
      <div className="history-actions">
        <button disabled={disabled || opening} onClick={onImport}>
          {t('importSgf')}
        </button>
        <span>{t('autoSavedGames', { v0: games.filter((item) => !item.preset).length })}</span>
      </div>
      <div className="record-filters" role="group" aria-label={t('recordCategories')}>
        {Object.entries(categories).map(([value, key]) => (
          <button
            key={value}
            aria-pressed={!downloads && !fox && category === value}
            onClick={() => {
              setDownloads(false);
              setFox(false);
              setCategory(value as RecordCategory);
              setOffset(0);
              setError('');
            }}
          >
            {t(key)}
          </button>
        ))}
        <button
          aria-pressed={fox}
          onClick={() => {
            setFox(true);
            setDownloads(false);
          }}
        >
          {t('foxRecords')}
        </button>
        <button
          aria-pressed={downloads}
          onClick={() => {
            setDownloads(true);
            setFox(false);
          }}
        >
          {t('recordDownloads')}
        </button>
      </div>
      {fox ? (
        <FoxRecords disabled={disabled} onSelect={onSelect} />
      ) : downloads ? (
        <RecordDownloader onInstalled={() => setRevision((value) => value + 1)} />
      ) : (
        <>
          <input
            type="search"
            aria-label={t('searchRecords')}
            placeholder={t('searchRecords')}
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
          />
          {error && <p role="alert">{localizeDiagnostic(error)}</p>}
          {category === 'famous' && loading ? (
            <p role="status">{t('recordsLoading')}</p>
          ) : (
            <>
              {!groups.size && <p role="status">{t('noRecords')}</p>}
              {[...groups].map(([id, entries]) => {
                const source = all.find((item) => item.id === id);
                const related = all.filter((item) => recordGroupId(item) === id);
                const displayed =
                  category === 'history' && source?.preset ? [...entries, source] : entries;
                return (
                  <section className="record-group" key={id}>
                    {related.length > 1 && (
                      <h3>
                        {t('recordGroup', {
                          v0: source?.title ?? entries[0].title,
                          v1: related.length,
                        })}
                      </h3>
                    )}
                    <div className="history-list">
                      {displayed.map((item) => (
                        <div className="record-entry" key={item.id}>
                          <article>
                            <button
                              disabled={disabled || opening || !!item.unavailable}
                              aria-pressed={item.id === selectedId}
                              onClick={() => void open(item)}
                            >
                              <b>{item.title}</b>
                              <small>
                                {t(categories[item.preset?.category ?? 'history'])} ·{' '}
                                {t('gameHistoryEntry', {
                                  v0: item.moves,
                                  v1: item.preset
                                    ? item.date || t('presetRecord')
                                    : formatDate(item.updatedAt),
                                })}
                              </small>
                              {item.sourceId && (
                                <small>
                                  {t('recordDerived', {
                                    v0:
                                      all.find((parent) => parent.id === item.sourceId)?.title ??
                                      t('recordOriginal'),
                                    v1: item.forkTurn ?? 0,
                                  })}
                                </small>
                              )}
                            </button>
                            {!item.preset && (
                              <button
                                disabled={disabled || renaming}
                                onClick={() => {
                                  setEditing(item.id);
                                  setName(item.title);
                                }}
                              >
                                {t('recordRename')}
                              </button>
                            )}
                            <button onClick={() => void download(item)}>{t('exportSgf')}</button>
                          </article>
                          {editing === item.id && (
                            <form
                              className="record-rename"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void rename(item.id);
                              }}
                            >
                              <input
                                autoFocus
                                aria-label={t('recordName')}
                                maxLength={200}
                                value={name}
                                disabled={renaming}
                                onChange={(event) => setName(event.target.value)}
                              />
                              <button type="submit" disabled={renaming || !name.trim()}>
                                {t('recordSaveName')}
                              </button>
                              <button
                                type="button"
                                disabled={renaming}
                                onClick={() => setEditing(undefined)}
                              >
                                {t('cancel')}
                              </button>
                            </form>
                          )}
                          {item.unavailable && (
                            <p className="record-details">{localizeDiagnostic(item.unavailable)}</p>
                          )}
                          {item.preset && (
                            <div className="record-details">
                              {item.preset.description && <p>{item.preset.description}</p>}
                              <small className="record-source-link">
                                <a
                                  href={item.preset.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={item.preset.source}
                                >
                                  {t('source')}
                                </a>
                              </small>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {total > 0 && (
                <div className="record-pagination">
                  <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - pageSize))}
                  >
                    {t('recordsPrevious')}
                  </button>
                  <span>
                    {t('recordsPage', {
                      v0: offset + 1,
                      v1: Math.min(total, offset + pageSize),
                      v2: total,
                    })}
                  </span>
                  <button
                    disabled={offset + pageSize >= total}
                    onClick={() => setOffset(offset + pageSize)}
                  >
                    {t('recordsNext')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

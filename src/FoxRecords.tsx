import { useEffect, useRef, useState } from 'react';
import type { FoxCatalog, FoxImport } from '../shared/fox';
import type { SavedGame } from '../shared/library';
import { api } from './api';
import { localizeDiagnostic, t } from './i18n';

export function FoxRecords({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (record: SavedGame, warnings?: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<FoxCatalog>({ uid: '', nickname: '', games: [] });
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(true);
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    let current = true;
    void api<FoxCatalog>('library/fox')
      .then((result) => {
        if (!current) return;
        setCatalog(result);
        setKeyword(result.nickname || result.uid);
      })
      .catch((err) => {
        if (current) setError((err as Error).message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
      active.current = false;
    };
  }, []);
  async function sync() {
    setBusy(true);
    setError('');
    try {
      const result = await api<FoxCatalog>('library/fox/sync', { keyword: keyword.trim() });
      if (!active.current) return;
      setCatalog(result);
      setOffset(0);
    } catch (err) {
      if (active.current) setError((err as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function open(chessId: string) {
    setOpening(chessId);
    setError('');
    try {
      const result = await api<FoxImport>('library/fox/open', { chessId });
      if (active.current) onSelect(result.record, result.warnings);
    } catch (err) {
      if (active.current) setError((err as Error).message);
    } finally {
      if (active.current) setOpening('');
    }
  }
  return (
    <div className="fox-records">
      <p>{t('foxDescription')}</p>
      <form
        className="record-rename"
        onSubmit={(event) => {
          event.preventDefault();
          void sync();
        }}
      >
        <input
          aria-label={t('foxUsername')}
          placeholder={t('foxUsername')}
          maxLength={100}
          value={keyword}
          disabled={busy || !!opening}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="submit" disabled={busy || !!opening || !keyword.trim()}>
          {t('foxQuery')}
        </button>
      </form>
      {error && <p role="alert">{localizeDiagnostic(error)}</p>}
      {busy && <p role="status">{t('recordsLoading')}</p>}
      {opening && <p role="status">{t('foxOpening')}</p>}
      {catalog.uid && (
        <p>
          {t('foxResults', {
            name: catalog.nickname,
            uid: catalog.uid,
            count: catalog.games.length,
          })}
        </p>
      )}
      {catalog.uid && !catalog.games.length && <p role="status">{t('foxEmpty')}</p>}
      <div className="history-list">
        {catalog.games.slice(offset, offset + 20).map((game) => (
          <div className="record-entry" key={game.chessId}>
            <article>
              <button
                disabled={disabled || busy || !!opening}
                onClick={() => void open(game.chessId)}
              >
                <b>
                  {game.black || t('black')} vs {game.white || t('white')}
                </b>
                <small>
                  {game.date}
                  {game.moves !== undefined ? ` · ${t('foxMoves', { count: game.moves })}` : ''}
                </small>
                <small>{t(game.downloaded ? 'foxSaved' : 'foxDownloadOpen')}</small>
              </button>
            </article>
          </div>
        ))}
      </div>
      {catalog.games.length > 20 && (
        <div className="record-pagination">
          <button disabled={offset === 0} onClick={() => setOffset(offset - 20)}>
            {t('recordsPrevious')}
          </button>
          <span>
            {t('recordsPage', {
              v0: offset + 1,
              v1: Math.min(offset + 20, catalog.games.length),
              v2: catalog.games.length,
            })}
          </span>
          <button
            disabled={offset + 20 >= catalog.games.length}
            onClick={() => setOffset(offset + 20)}
          >
            {t('recordsNext')}
          </button>
        </div>
      )}
    </div>
  );
}

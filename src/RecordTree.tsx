import { useEffect, useState } from 'react';
import { Board } from './Board';
import { api } from './api';
import { t, localizeDiagnostic } from './i18n';
import { replay } from '../shared/go';
import type { SavedGame } from '../shared/library';
import type { RecordTreePage } from '../shared/record-tree';

export function RecordTree({
  id,
  disabled,
  onBack,
  onSelect,
}: {
  id: string;
  disabled: boolean;
  onBack: () => void;
  onSelect: (record: SavedGame, warnings?: string[], turn?: number) => void;
}) {
  const [cursor, setCursor] = useState(id);
  const [page, setPage] = useState<RecordTreePage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api<RecordTreePage>(`library/games/${cursor}/tree`)
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cursor]);
  const locked = disabled || loading;
  const game = page?.record?.game;
  return (
    <div className="record-tree">
      <div className="record-tree-tools">
        <button onClick={onBack}>{t('treeBackToRecords')}</button>
        <button
          disabled={locked || !page || page.id === page.rootId}
          onClick={() => setCursor(page!.rootId)}
        >
          {t('treeRoot')}
        </button>
        <button
          disabled={locked || !page || page.breadcrumbs.length < 2}
          onClick={() => setCursor(page!.breadcrumbs.at(-2)!.id)}
        >
          {t('treeParent')}
        </button>
        <button
          disabled={locked || !page?.record}
          onClick={() => onSelect(page!.record!, undefined, game!.moves.length)}
        >
          {t('treeOpenPosition')}
        </button>
      </div>
      {error && <p role="alert">{localizeDiagnostic(error)}</p>}
      {loading && <p role="status">{t('recordsLoading')}</p>}
      {page && (
        <>
          <nav className="record-tree-path" aria-label={t('treePath')}>
            {page.breadcrumbs.map((item) => (
              <button
                key={item.id}
                disabled={locked}
                aria-current={item.id === page.id ? 'step' : undefined}
                onClick={() => setCursor(item.id)}
              >
                {item.title}
              </button>
            ))}
          </nav>
          <div className="record-tree-content">
            <div className="record-tree-board">
              {game && (
                <Board
                  size={game.size}
                  position={replay(game)}
                  lastPoint={game.moves.at(-1)?.point}
                  annotations={page.annotations}
                  dead={[]}
                  disabled={locked}
                  scoring={false}
                  onPlay={(point) => {
                    const child = page.children.find((item) => item.point === point);
                    if (child) setCursor(child.id);
                  }}
                />
              )}
              {page.unavailable && <p role="alert">{localizeDiagnostic(page.unavailable)}</p>}
              {page.warnings.map((warning) => (
                <p className="record-details" key={warning}>
                  {localizeDiagnostic(warning)}
                </p>
              ))}
            </div>
            <div className="record-tree-notes">
              <h3>{t('treeVariations')}</h3>
              <div className="record-tree-children">
                {page.children.map((child) => (
                  <button disabled={locked} key={child.id} onClick={() => setCursor(child.id)}>
                    {child.title}
                  </button>
                ))}
                {!page.children.length && <p>{t('treeEnd')}</p>}
              </div>
              {page.comment && (
                <div className="record-tree-comment">
                  <h3>{t('treeComment')}</h3>
                  <p>{page.comment}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

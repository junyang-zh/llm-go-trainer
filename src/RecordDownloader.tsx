import { useEffect, useRef, useState } from 'react';
import type { RecordSource } from '../shared/presets';
import { api } from './api';
import { localizeDiagnostic, t } from './i18n';

export function RecordDownloader({ onInstalled }: { onInstalled: () => void }) {
  const [sources, setSources] = useState<RecordSource[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useRef(onInstalled);
  notify.current = onInstalled;
  useEffect(() => {
    let active = true;
    let previous: RecordSource[] = [];
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await api<RecordSource[]>('library/sources');
        if (!active) return;
        if (
          result.some(
            (source) =>
              source.state === 'installed' &&
              previous.some((old) => old.id === source.id && old.state !== 'installed'),
          )
        )
          notify.current();
        previous = result;
        setSources(result);
        setError('');
      } catch (err) {
        if (active) setError((err as Error).message);
      }
      if (active) timer = setTimeout(() => void refresh(), 1000);
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  async function action(id: string, action: 'download' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      setSources(await api<RecordSource[]>(`library/sources/${id}/${action}`, {}));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const mb = (value: number) => (value / 1024 / 1024).toFixed(1);
  return (
    <div className="record-downloads">
      {error && <p role="alert">{localizeDiagnostic(error)}</p>}
      {!sources.length && !error && <p role="status">{t('recordsLoading')}</p>}
      {sources.map((source) => {
        const running = source.state === 'downloading' || source.state === 'importing';
        return (
          <section className="record-source" key={source.id}>
            <h3>{source.name}</h3>
            <p>
              {t('recordSourceSize', {
                v0: source.count.toLocaleString(),
                v1: mb(source.sizeBytes),
              })}
            </p>
            <p>{t('recordSourceDescription')}</p>
            {source.state === 'installed' ? (
              <p role="status">{t(source.bundled ? 'recordBundled' : 'recordInstalled')}</p>
            ) : (
              <>
                {running && (
                  <div role="status">
                    <p>
                      {source.state === 'importing'
                        ? t('recordImporting', { v0: source.processed ?? 0 })
                        : t('recordDownloading', {
                            v0: mb(source.received ?? 0),
                            v1: mb(source.total ?? source.sizeBytes),
                          })}
                    </p>
                    <progress
                      aria-label={t('recordDownloads')}
                      value={
                        source.state === 'importing'
                          ? (source.processed ?? 0)
                          : (source.received ?? 0)
                      }
                      max={
                        source.state === 'importing'
                          ? source.count
                          : (source.total ?? source.sizeBytes)
                      }
                    />
                  </div>
                )}
                {source.error && <p role="alert">{localizeDiagnostic(source.error)}</p>}
                <button
                  disabled={busy}
                  onClick={() => void action(source.id, running ? 'cancel' : 'download')}
                >
                  {t(
                    running
                      ? 'cancel'
                      : source.state === 'error'
                        ? 'recordRetryDownload'
                        : 'recordDownload',
                  )}
                </button>
              </>
            )}
            <small className="record-source-link">
              <a href={source.url} target="_blank" rel="noreferrer" title={source.name}>
                {t('source')}
              </a>
            </small>
          </section>
        );
      })}
    </div>
  );
}

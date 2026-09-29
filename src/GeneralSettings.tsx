import {
  t,
  localizeDiagnostic,
  useLanguage,
  locales,
  languageNames,
  type LanguagePreference,
  formatDate,
} from './i18n';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../shared/updates';
import { version } from '../package.json';

export function GeneralSettings({
  beforeInstall,
  busy = false,
}: {
  beforeInstall: () => Promise<void>;
  busy?: boolean;
}) {
  const labels: Record<UpdateStatus['phase'], string> = {
    idle: t('updatesNotCheckedYet'),
    checking: t('checkingGithubReleases'),
    current: t('upToDate'),
    available: t('updateAvailable'),
    downloading: t('downloadingUpdate'),
    downloaded: t('updateDownloadedReadyToRestart'),
    installing: t('quittingAndInstallingUpdate'),
    error: t('updateFailed'),
  };
  const language = useLanguage();
  const bridge = window.goTrainerUpdates;
  const [status, setStatus] = useState<UpdateStatus>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        const next = await bridge.status();
        if (active) setStatus(next);
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
  }, [bridge]);
  async function run(action: () => Promise<UpdateStatus>) {
    setWorking(true);
    setError('');
    try {
      setStatus(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const pending =
    working || ['checking', 'downloading', 'installing'].includes(status?.phase || '');
  return (
    <section className="general-settings" aria-label={t('generalSettings')}>
      <label>
        {t('language')}
        <select
          aria-label={t('language')}
          value={language.preference}
          onChange={(event) => language.setLanguage(event.target.value as LanguagePreference)}
        >
          <option value="system">{t('systemLanguage')}</option>
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {languageNames[locale]}
            </option>
          ))}
        </select>
      </label>
      <h3>{t('appUpdates')}</h3>
      <p className="engine-detail">
        {t('currentVersion', {
          v0: status?.version || version,
          v1: status
            ? ` · ${status.edition === 'minimal' ? t('minimalEdition') : t('standardEdition')}`
            : '',
        })}
      </p>
      {!bridge ? (
        <p className="engine-detail">{t('updatesDesktopOnly')}</p>
      ) : (
        <>
          <label className="update-checkbox">
            <input
              type="checkbox"
              checked={status?.automatic ?? false}
              disabled={!status?.supported || working}
              onChange={(event) => void run(() => bridge.automatic(event.target.checked))}
            />
            {t('automaticUpdates')}
          </label>
          <p className="engine-detail">{t('automaticUpdatesHelp')}</p>
          {status?.reason && <p className="engine-detail">{localizeDiagnostic(status.reason)}</p>}
          {status?.reusesModels && <p className="update-cache-note">{t('updateReusesModels')}</p>}
          <p role="status">
            {status ? labels[status.phase] : t('readingUpdateSettings')}
            {status?.latestVersion ? ` · ${status.latestVersion}` : ''}
          </p>
          {status?.phase === 'downloading' && (
            <>
              <progress
                max="100"
                value={status.progress || 0}
                aria-label={t('updateDownloadProgress')}
              />
              <span className="engine-detail"> {Math.round(status.progress || 0)}%</span>
            </>
          )}
          {status?.checkedAt && (
            <p className="engine-detail">
              {t('lastChecked', { v0: formatDate(status.checkedAt) })}
            </p>
          )}
          <div className="engine-actions">
            <button
              disabled={!status?.supported || pending || status.phase === 'downloaded'}
              onClick={() => void run(() => bridge.check())}
            >
              {t('checkForUpdates')}
            </button>
            {status?.phase === 'available' && status.canInstall && (
              <button
                className="primary"
                disabled={pending}
                onClick={() => void run(() => bridge.download())}
              >
                {t('downloadUpdate')}
              </button>
            )}
            {status?.phase === 'downloaded' && (
              <button
                className="primary"
                disabled={pending || busy}
                onClick={() =>
                  void run(async () => {
                    await beforeInstall();
                    return bridge.install();
                  })
                }
              >
                {t('restartAndInstall')}
              </button>
            )}
          </div>
          {status?.phase === 'downloaded' && busy && (
            <p className="engine-detail">{t('updateWaitUntilIdle')}</p>
          )}
        </>
      )}
      {(error || status?.error) && (
        <p className="error" role="alert">
          {localizeDiagnostic(error || status?.error || '')}
        </p>
      )}
      <a
        href="https://github.com/junyang-zh/llm-go-trainer/releases"
        target="_blank"
        rel="noreferrer"
      >
        {t('viewGithubReleases')}
      </a>
    </section>
  );
}

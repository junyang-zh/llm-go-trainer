import { t, localizeDiagnostic } from './i18n';
import { useEffect, useState } from 'react';
import { api } from './api';
import { Dialog } from './Dialog';
import type { EngineConnection, EngineStatus } from '../shared/types';
import { ModelSettings } from './ModelSettings';

export function engineLabel(status?: EngineStatus) {
  if (!status) return t('readingEngineStatus');
  const external = status.mode === 'external';
  const labels = {
    idle: t('preparing'),
    downloading: t('downloading'),
    installing: t('installing'),
    starting: external ? t('connecting') : t('starting'),
    ready: external ? t('connected') : t('engineRunning'),
    stopping: external ? t('disconnecting') : t('stopping'),
    stopped: external ? t('disconnected') : t('stopped'),
    error: t('error'),
  };
  const progress = status.progress;
  const percentage = progress?.total
    ? ` ${Math.round((progress.received / progress.total) * 100)}%`
    : '';
  return `${status.name || 'KataGo'} · ${status.phase ? labels[status.phase] : status.running ? t('engineRunning') : t('notStarted')}${progress ? ` · ${localizeDiagnostic(progress.label)}${percentage}` : ''}`;
}
type Action = 'start' | 'stop' | 'restart' | 'connect';
export function EngineSettings(props: {
  status?: EngineStatus;
  onChange: (status: EngineStatus) => void;
  busy?: boolean;
}) {
  return (
    <ModelSettings {...props}>
      <EngineConnectionSettings {...props} />
    </ModelSettings>
  );
}
function EngineConnectionSettings({
  status,
  onChange,
  busy,
}: {
  status?: EngineStatus;
  onChange: (status: EngineStatus) => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(t('externalGoAi'));
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<Action>();
  const [error, setError] = useState('');
  const mode = status?.mode || 'managed';
  const external = mode === 'external';
  const active =
    !!status?.phase &&
    ['downloading', 'installing', 'starting', 'ready', 'stopping'].includes(status.phase);
  useEffect(() => {
    void api<EngineConnection>('engine/connection')
      .then((connection) => {
        if (connection.mode === 'external') {
          setName(connection.name);
          setUrl(connection.url);
        }
      })
      .catch((error) => setError(error.message));
  }, []);
  async function control(action: Action, connection?: EngineConnection) {
    setWorking(action);
    setError('');
    try {
      const next = await api<EngineStatus>(`engine/${action}`, connection || {});
      onChange(next);
      if (action === 'connect') setEditing(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setWorking(undefined);
    }
  }
  const displayed =
    working === 'stop' && status ? { ...status, phase: 'stopping' as const } : status;
  return (
    <div className="engine-settings">
      <div className="engine-state" role="status">
        {engineLabel(displayed)}
      </div>
      {status?.progress?.total && (
        <progress
          max={status.progress.total}
          value={status.progress.received}
          aria-label={t('downloadProgress')}
        />
      )}
      {status?.backend && (
        <div className="engine-detail">
          {localizeDiagnostic(status.backend)}
          {status.pid ? ` · PID ${status.pid}` : ''}
        </div>
      )}
      {!editing && (error || status?.error) && (
        <p className="error" role="alert">
          {localizeDiagnostic(error || status?.error || '')}
        </p>
      )}
      <div className="engine-actions">
        <button
          disabled={!!working || !status || status.phase === 'stopping'}
          onClick={() => void control(active ? 'stop' : 'start')}
        >
          {active
            ? external
              ? t('disconnect')
              : t('stop')
            : external
              ? t('connect')
              : t('startEngine')}
        </button>
        {status?.ready && (
          <button disabled={!!working} onClick={() => void control('restart')}>
            {external ? t('reconnect') : t('restart')}
          </button>
        )}
      </div>
      <label>
        {t('currentEngine')}
        <select
          disabled={!!working || !status}
          value={mode}
          onChange={(event) => {
            if (event.target.value === 'managed') void control('connect', { mode: 'managed' });
            else {
              setError('');
              setEditing(true);
            }
          }}
        >
          <option value="managed">KataGo</option>
          <option value="external">
            {external ? status?.name || t('externalGoAi') : t('externalGoAiOption')}
          </option>
        </select>
      </label>
      {!external && !!status?.availableBackends?.length && (
        <label>
          {t('computeBackend')}
          <select
            value={status.selectedBackend ?? 'opencl'}
            disabled={!!working || busy || status.phase === 'stopping'}
            onChange={(event) =>
              void control('connect', {
                mode: 'managed',
                backend: event.target.value as 'opencl' | 'cuda',
              })
            }
          >
            {status.availableBackends.map((backend) => (
              <option key={backend} value={backend}>
                {backend === 'cuda' ? 'CUDA（NVIDIA）' : 'OpenCL'}
              </option>
            ))}
          </select>
        </label>
      )}
      {external && (
        <button
          className="engine-address"
          onClick={() => {
            setError('');
            setEditing(true);
          }}
          disabled={!!working}
        >
          {t('editAddress')}
        </button>
      )}
      {editing && (
        <Dialog
          title={t('connectExternalEngine')}
          onClose={() => {
            if (!working) {
              setEditing(false);
              setError('');
            }
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void control('connect', { mode: 'external', name, url });
            }}
          >
            <label>
              {t('name')}
              <input
                required
                maxLength={60}
                value={name}
                disabled={!!working}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              {t('analysisEndpoint')}
              <input
                type="url"
                required
                placeholder={t('analysisUrlPlaceholder')}
                value={url}
                disabled={!!working}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {localizeDiagnostic(error)}
              </p>
            )}
            <div className="engine-actions">
              <button type="submit" disabled={!!working}>
                {working ? t('connecting') : t('connect')}
              </button>
              <button
                type="button"
                disabled={!!working}
                onClick={() => {
                  setEditing(false);
                  setError('');
                }}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

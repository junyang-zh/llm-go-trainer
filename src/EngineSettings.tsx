import { useEffect, useState } from 'react';
import { api } from './api';
import { Dialog } from './Dialog';
import type { EngineConnection, EngineStatus } from '../shared/types';

export function engineLabel(status?: EngineStatus) {
  if (!status) return '引擎状态读取中';
  const external = status.mode === 'external';
  const labels = {
    idle: '准备中',
    downloading: '下载中',
    installing: '安装中',
    starting: external ? '连接中' : '启动中',
    ready: external ? '已连接' : '运行中',
    stopping: external ? '断开中' : '停止中',
    stopped: external ? '已断开' : '已停止',
    error: '错误',
  };
  const progress = status.progress;
  const percentage = progress?.total
    ? ` ${Math.round((progress.received / progress.total) * 100)}%`
    : '';
  return `${status.name || 'KataGo'} · ${status.phase ? labels[status.phase] : status.running ? '运行中' : '未启动'}${progress ? ` · ${progress.label}${percentage}` : ''}`;
}
type Action = 'start' | 'stop' | 'restart' | 'connect';
export function EngineSettings({
  status,
  onChange,
}: {
  status?: EngineStatus;
  onChange: (status: EngineStatus) => void;
}) {
  const [name, setName] = useState('外部围棋 AI');
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
          aria-label="下载进度"
        />
      )}
      {status?.backend && (
        <div className="engine-detail">
          {status.backend}
          {status.pid ? ` · PID ${status.pid}` : ''}
        </div>
      )}
      {!editing && (error || status?.error) && (
        <p className="error" role="alert">
          {error || status?.error}
        </p>
      )}
      <div className="engine-actions">
        <button
          disabled={!!working || !status || status.phase === 'stopping'}
          onClick={() => void control(active ? 'stop' : 'start')}
        >
          {active ? (external ? '断开' : '停止') : external ? '连接' : '启动'}
        </button>
        {status?.ready && (
          <button disabled={!!working} onClick={() => void control('restart')}>
            {external ? '重新连接' : '重启'}
          </button>
        )}
      </div>
      <label>
        当前引擎
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
            {external ? status?.name || '外部围棋 AI' : '外部围棋 AI…'}
          </option>
        </select>
      </label>
      {external && (
        <button
          className="engine-address"
          onClick={() => {
            setError('');
            setEditing(true);
          }}
          disabled={!!working}
        >
          修改地址
        </button>
      )}
      {editing && (
        <Dialog
          title="连接外部引擎"
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
              名称
              <input
                required
                maxLength={60}
                value={name}
                disabled={!!working}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              分析接口地址
              <input
                type="url"
                required
                placeholder="http://127.0.0.1:端口/api/analyze"
                value={url}
                disabled={!!working}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="engine-actions">
              <button type="submit" disabled={!!working}>
                {working ? '连接中' : '连接'}
              </button>
              <button
                type="button"
                disabled={!!working}
                onClick={() => {
                  setEditing(false);
                  setError('');
                }}
              >
                取消
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

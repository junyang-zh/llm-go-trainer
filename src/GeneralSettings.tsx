import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../shared/updates';
import { version } from '../package.json';

const labels: Record<UpdateStatus['phase'], string> = {
  idle: '尚未检查更新',
  checking: '正在检查 GitHub Release…',
  current: '已是最新版本',
  available: '发现新版本',
  downloading: '正在下载更新',
  downloaded: '更新已下载，可重启安装',
  installing: '正在退出并安装更新…',
  error: '更新失败',
};
export function GeneralSettings({
  beforeInstall,
  busy = false,
}: {
  beforeInstall: () => Promise<void>;
  busy?: boolean;
}) {
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
    <section className="general-settings" aria-label="通用设置">
      <h3>应用更新</h3>
      <p className="engine-detail">
        当前版本 {status?.version || version}
        {status ? ` · ${status.edition === 'minimal' ? 'minimal 版' : '普通版'}` : ''}
      </p>
      {!bridge ? (
        <p className="engine-detail">请使用桌面应用检查和安装更新。</p>
      ) : (
        <>
          <label className="update-checkbox">
            <input
              type="checkbox"
              checked={status?.automatic ?? false}
              disabled={!status?.supported || working}
              onChange={(event) => void run(() => bridge.automatic(event.target.checked))}
            />
            自动更新
          </label>
          <p className="engine-detail">
            启动后自动检查并下载更新，准备好后点击“重启并安装”。已有模型缓存时只下载不含模型的应用安装包，保留模型、引擎缓存与本地数据；缺失的模型按需下载。
          </p>
          {status?.reason && <p className="engine-detail">{status.reason}</p>}
          {status?.reusesModels && (
            <p className="update-cache-note">本次更新复用本地模型，不重复下载模型权重。</p>
          )}
          <p role="status">
            {status ? labels[status.phase] : '读取更新设置…'}
            {status?.latestVersion ? ` · ${status.latestVersion}` : ''}
          </p>
          {status?.phase === 'downloading' && (
            <>
              <progress max="100" value={status.progress || 0} aria-label="更新下载进度" />
              <span className="engine-detail"> {Math.round(status.progress || 0)}%</span>
            </>
          )}
          {status?.checkedAt && (
            <p className="engine-detail">上次检查：{new Date(status.checkedAt).toLocaleString()}</p>
          )}
          <div className="engine-actions">
            <button
              disabled={!status?.supported || pending || status.phase === 'downloaded'}
              onClick={() => void run(() => bridge.check())}
            >
              检查更新
            </button>
            {status?.phase === 'available' && status.canInstall && (
              <button
                className="primary"
                disabled={pending}
                onClick={() => void run(() => bridge.download())}
              >
                下载更新
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
                重启并安装
              </button>
            )}
          </div>
          {status?.phase === 'downloaded' && busy && (
            <p className="engine-detail">请先结束当前分析或对局操作，再重启安装。</p>
          )}
        </>
      )}
      {(error || status?.error) && (
        <p className="error" role="alert">
          {error || status?.error}
        </p>
      )}
      <a
        href="https://github.com/junyang-zh/llm-go-trainer/releases"
        target="_blank"
        rel="noreferrer"
      >
        查看 GitHub Release
      </a>
    </section>
  );
}

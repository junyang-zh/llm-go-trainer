import { useEffect, useState } from 'react';
import { api } from './api';
import type { LlmSettingsView, LlmStatus, Provider, ProviderPreference } from '../shared/types';
import { availabilityLabel, effortLabels, effortOptions, providerNames } from '../shared/llm';

function ProviderForm({
  provider,
  view,
  save,
  working,
}: {
  provider: Provider;
  view: LlmSettingsView;
  save: (patch: unknown) => Promise<boolean>;
  working: boolean;
}) {
  const config = view[provider];
  const [model, setModel] = useState(config.model);
  const [effort, setEffort] = useState(config.effort);
  const [key, setKey] = useState('');
  const [url, setUrl] = useState(view.deepseek.baseUrl);
  const choices = view.models[provider];
  const [custom, setCustom] = useState(!!model && !choices.some((choice) => choice.id === model));
  const advertised = choices.find((choice) => choice.id === model)?.efforts;
  const levels: readonly string[] = advertised?.length
    ? ['default', ...advertised.filter((value) => value !== 'default')]
    : effortOptions[provider];
  function chooseModel(value: string) {
    setModel(value);
    const supported = choices.find((choice) => choice.id === value)?.efforts;
    if (supported?.length && effort !== 'default' && !supported.includes(effort))
      setEffort('default');
  }
  return (
    <form
      className="provider-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const patch =
          provider === 'deepseek'
            ? {
                deepseek: {
                  model,
                  effort,
                  baseUrl: url,
                  ...(key.trim() ? { apiKey: key.trim() } : {}),
                },
              }
            : { [provider]: { model, effort } };
        if (await save(patch)) setKey('');
      }}
    >
      {provider === 'deepseek' && (
        <>
          <label>
            API 地址
            <input
              type="url"
              required
              value={url}
              disabled={working}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            API key{' '}
            <span className="key-source">
              {view.deepseek.keySource === 'app'
                ? '本机已保存'
                : view.deepseek.keySource === 'env'
                  ? '环境变量'
                  : '未配置'}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={key}
              maxLength={4096}
              disabled={working}
              placeholder={view.deepseek.keyConfigured ? '已配置' : 'API key'}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
        </>
      )}
      <div className="model-settings">
        <label>
          模型
          <select
            aria-label={`${providerNames[provider]} 模型`}
            disabled={working}
            value={custom ? '__custom' : model}
            onChange={(event) => {
              const value = event.target.value;
              setCustom(value === '__custom');
              chooseModel(value === '__custom' ? '' : value);
            }}
          >
            {provider !== 'deepseek' && <option value="">CLI 默认</option>}
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.id}
              </option>
            ))}
            <option value="__custom">自定义…</option>
          </select>
        </label>
        <label>
          思考深度
          <select
            aria-label={`${providerNames[provider]} 思考深度`}
            disabled={working}
            value={effort}
            onChange={(event) => setEffort(event.target.value)}
          >
            {levels.map((value) => (
              <option key={value} value={value}>
                {effortLabels[value] || value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {custom && (
        <label>
          模型 ID
          <input
            required
            value={model}
            maxLength={200}
            disabled={working}
            onChange={(event) => chooseModel(event.target.value)}
          />
        </label>
      )}
      <div className="engine-actions">
        <button type="submit" disabled={working}>
          保存
        </button>
        {provider === 'deepseek' && view.deepseek.keySource === 'app' && (
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              if (await save({ deepseek: { apiKey: null } })) setKey('');
            }}
          >
            移除本机 key
          </button>
        )}
      </div>
    </form>
  );
}
export function LlmSettings({
  status,
  onChange,
}: {
  status?: LlmStatus;
  onChange: (status: LlmStatus) => void;
}) {
  const [view, setView] = useState<LlmSettingsView>();
  const [expanded, setExpanded] = useState<Provider | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void api<LlmSettingsView>('llm/settings')
      .then((value) => {
        setView(value);
        setExpanded(value.selected || 'deepseek');
      })
      .catch((error) => setError(error.message));
  }, []);
  async function save(patch: unknown, check = false) {
    setWorking(true);
    setError('');
    setSaved(false);
    try {
      const value = await api<LlmSettingsView>(check ? 'llm/check' : 'llm/settings', patch);
      setView(value);
      onChange(value);
      setSaved(!check);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }
  const current = status || view;
  return (
    <section className="llm-settings" aria-label="LLM 设置">
      <label>
        LLM
        <select
          aria-label="LLM 服务"
          value={current?.preference || 'auto'}
          disabled={working || !view}
          onChange={async (event) => {
            const preference = event.target.value as ProviderPreference;
            if (await save({ preference })) {
              if (preference !== 'auto') setExpanded(preference);
            }
          }}
        >
          <option value="auto">
            自动选择
            {current?.preference === 'auto' && current.selected
              ? ` · ${providerNames[current.selected]}`
              : ''}
          </option>
          {(Object.keys(providerNames) as Provider[]).map((provider) => (
            <option key={provider} value={provider}>
              {providerNames[provider]} · {availabilityLabel(current?.providers[provider])}
            </option>
          ))}
        </select>
      </label>
      {view &&
        (Object.keys(providerNames) as Provider[]).map((provider) => (
          <details key={provider} className="provider-config" open={expanded === provider}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                setExpanded(expanded === provider ? null : provider);
                setSaved(false);
              }}
            >
              {providerNames[provider]}
              <span>{availabilityLabel(current?.providers[provider])}</span>
            </summary>
            {expanded === provider && (
              <ProviderForm provider={provider} view={view} save={save} working={working} />
            )}
          </details>
        ))}
      {(error || current?.error) && (
        <p className="error" role="alert">
          {error || current?.error}
        </p>
      )}
      <div className="llm-settings-footer">
        <button disabled={working || !view} onClick={() => void save({}, true)}>
          {working ? '检测中' : '检测连接'}
        </button>
        {saved && <span role="status">已保存</span>}
      </div>
    </section>
  );
}

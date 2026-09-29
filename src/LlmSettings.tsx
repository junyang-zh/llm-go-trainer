import { availabilityLabel, effortLabel, limitLabel } from './ui-labels';
import { t, localizeDiagnostic } from './i18n';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { LlmSettingsView, LlmStatus, Provider, ProviderPreference } from '../shared/types';
import { coachLimitFields, type CoachLimits, effortOptions, providerNames } from '../shared/llm';

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
  const cli = provider === 'deepseek' ? undefined : view[provider];
  const [path, setPath] = useState(cli?.path || '');
  const [nodePath, setNodePath] = useState(cli?.nodePath || '');
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
            : { [provider]: { model, effort, path, nodePath } };
        if (await save(patch)) {
          setKey('');
          setPath(path.trim());
          setNodePath(nodePath.trim());
        }
      }}
    >
      {provider === 'deepseek' && (
        <>
          <label>
            {t('apiUrl')}
            <input
              type="url"
              required
              value={url}
              disabled={working}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            {t('apiKey')}{' '}
            <span className="key-source">
              {view.deepseek.keySource === 'app'
                ? t('savedLocally')
                : view.deepseek.keySource === 'env'
                  ? t('environmentVariable')
                  : t('notConfigured')}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={key}
              maxLength={4096}
              disabled={working}
              placeholder={view.deepseek.keyConfigured ? t('configured') : t('apiKey')}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
        </>
      )}
      {cli && (
        <>
          <label>
            {t('providerCliPath', { v0: providerNames[provider] })}
            <input
              aria-label={t('providerCliPath', { v0: providerNames[provider] })}
              value={path}
              placeholder={cli.defaultPath}
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              disabled={working}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <label>
            {t('nodePath')}
            <input
              aria-label={t('nodePath')}
              value={nodePath}
              placeholder={cli.defaultNodePath}
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              disabled={working}
              onChange={(event) => setNodePath(event.target.value)}
            />
          </label>
          <p className="limits-help">{t('cliPathHelp')}</p>
        </>
      )}
      <div className="model-settings">
        <label>
          {t('model')}
          <select
            aria-label={t('providerModel', { v0: providerNames[provider] })}
            disabled={working}
            value={custom ? '__custom' : model}
            onChange={(event) => {
              const value = event.target.value;
              setCustom(value === '__custom');
              chooseModel(value === '__custom' ? '' : value);
            }}
          >
            {provider !== 'deepseek' && <option value="">{t('cliDefault')}</option>}
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.id}
              </option>
            ))}
            <option value="__custom">{t('custom')}</option>
          </select>
        </label>
        <label>
          {t('reasoningEffort')}
          <select
            aria-label={t('providerEffort', { v0: providerNames[provider] })}
            disabled={working}
            value={effort}
            onChange={(event) => setEffort(event.target.value)}
          >
            {levels.map((value) => (
              <option key={value} value={value}>
                {effortLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {custom && (
        <label>
          {t('modelId')}
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
          {t('save')}
        </button>
        {provider === 'deepseek' && view.deepseek.keySource === 'app' && (
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              if (await save({ deepseek: { apiKey: null } })) setKey('');
            }}
          >
            {t('removeLocalKey')}
          </button>
        )}
      </div>
    </form>
  );
}
function WorkLimits({
  limits,
  save,
  working,
}: {
  limits: CoachLimits;
  save: (patch: unknown) => Promise<boolean>;
  working: boolean;
}) {
  const [draft, setDraft] = useState(limits);
  useEffect(() => setDraft(limits), [limits]);
  return (
    <details className="provider-config">
      <summary>{t('agentWorkLimits')}</summary>
      <form
        className="provider-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ limits: draft });
        }}
      >
        <div className="model-settings">
          {(Object.keys(coachLimitFields) as (keyof CoachLimits)[]).map((key) => {
            const field = coachLimitFields[key];
            return (
              <label key={key}>
                {limitLabel(key)}
                <input
                  type="number"
                  placeholder={t('unlimited')}
                  min={field.min}
                  max={field.max}
                  step="1"
                  value={draft[key] || ''}
                  disabled={working}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [key]: event.target.value === '' ? 0 : event.target.valueAsNumber,
                    })
                  }
                />
              </label>
            );
          })}
        </div>
        <p className="limits-help">{t('workLimitsHelp')}</p>
        <div className="engine-actions">
          <button type="submit" disabled={working}>
            {t('saveWorkLimits')}
          </button>
        </div>
      </form>
    </details>
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
    <section className="llm-settings" aria-label={t('llmSettings')}>
      <label>
        LLM
        <select
          aria-label={t('llmProvider')}
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
            {t('automatic', {
              v0:
                current?.preference === 'auto' && current.selected
                  ? ` · ${providerNames[current.selected]}`
                  : '',
            })}
          </option>
          {(Object.keys(providerNames) as Provider[]).map((provider) => (
            <option key={provider} value={provider}>
              {providerNames[provider]} · {availabilityLabel(current?.providers[provider])}
            </option>
          ))}
        </select>
      </label>
      <hr className="llm-divider" />
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
      <hr className="llm-divider" />
      {view && <WorkLimits limits={view.limits} save={save} working={working} />}
      {(error || current?.error) && (
        <p className="error" role="alert">
          {localizeDiagnostic(error || current?.error || '')}
        </p>
      )}
      <div className="llm-settings-footer">
        <button disabled={working || !view} onClick={() => void save({}, true)}>
          {working ? t('checking') : t('checkConnection')}
        </button>
        {saved && <span role="status">{t('saved')}</span>}
      </div>
    </section>
  );
}

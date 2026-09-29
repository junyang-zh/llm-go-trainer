import { useEffect, useSyncExternalStore } from 'react';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const locales = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'] as const;
export type Locale = (typeof locales)[number];
export type LanguagePreference = Locale | 'system';
export type MessageKey = keyof typeof en;
export const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
};
export const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
};
export const languageStorageKey = 'go-trainer-language-v1';
const listeners = new Set<() => void>();
let unavailableStoragePreference: LanguagePreference = 'system';

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase().replaceAll('_', '-');
    const [base] = tag.split('-');
    if (base === 'zh') {
      // An explicit script takes precedence over the region (e.g. zh-Hans-HK).
      if (tag.includes('-hans')) return 'zh-CN';
      return /-(hant|tw|hk|mo)(-|$)/.test(tag) ? 'zh-TW' : 'zh-CN';
    }
    if (base === 'en' || base === 'ja' || base === 'ko') return base;
  }
  return 'en';
}
export function getLanguagePreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(languageStorageKey);
    return locales.includes(saved as Locale) ? (saved as Locale) : 'system';
  } catch {
    return unavailableStoragePreference;
  }
}
export function getLocale(): Locale {
  const preference = getLanguagePreference();
  return preference === 'system'
    ? resolveLocale(
        typeof navigator === 'undefined'
          ? []
          : navigator.languages?.length
            ? navigator.languages
            : [navigator.language],
      )
    : preference;
}
function notify() {
  for (const listener of listeners) listener();
}
export function setLanguage(preference: LanguagePreference) {
  unavailableStoragePreference = preference;
  try {
    localStorage.setItem(languageStorageKey, preference);
  } catch {
    /* private browsing */
  }
  notify();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('languagechange', listener);
  const storage = (event: StorageEvent) => {
    if (event.key === languageStorageKey || event.key === null) listener();
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('languagechange', listener);
    window.removeEventListener('storage', storage);
  };
}
const snapshot = () => `${getLanguagePreference()}:${getLocale()}`;
export function useLanguage() {
  useSyncExternalStore(subscribe, snapshot, () => 'system:en');
  const locale = getLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return { locale, preference: getLanguagePreference(), setLanguage };
}
export function translate(
  locale: Locale,
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  // One pass: substituted user text is never interpreted as another placeholder.
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
export function t(key: MessageKey, values?: Record<string, string | number>) {
  return translate(getLocale(), key, values);
}
export const formatNumber = (value: number) => value.toLocaleString(getLocale());
export const formatDate = (value: string) => new Date(value).toLocaleString(getLocale());
export const formatDateOnly = (value: string) => new Date(value).toLocaleDateString(getLocale());

// Services retain their diagnostic contracts. Translate known UI messages at render time,
// preserving custom names, coordinates, URLs and unknown provider output verbatim.
const diagnosticKeys = (Object.keys(zhCN) as MessageKey[]).filter(
  (key) =>
    /^(runtime|modelName|error|warningSgf|updateInstalledOnly|updateUnsignedMac|sgfTooLarge)/.test(
      key,
    ) ||
    [
      'candidateMismatch',
      'trialMissing',
      'coachGameMissing',
      'invalidStartTurn',
      'trialGameChanged',
      'invalidTrialTurn',
      'bothPlayersHavePassed',
      'aiTurn',
      'resuming',
      'connecting',
      'stopped',
      'incomplete',
      'preparingAnalysis',
      'generating',
      'analysisInterrupted',
      'couldNotSaveHistory',
      'couldNotLoadHistory',
      'requestFailed',
      'noResponseStreamReceived',
      'connectionInterruptedAnalysisIncomplete',
      'engineNoMove',
      'engineSearching',
    ].includes(key),
);
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const diagnosticPatterns = diagnosticKeys.flatMap((key) =>
  [...new Set(locales.map((locale) => catalogs[locale][key]))].map((source) => {
    const fields: string[] = [];
    let pattern = '',
      cursor = 0;
    for (const match of source.matchAll(/\{(\w+)\}/g)) {
      pattern += escapePattern(source.slice(cursor, match.index)) + '([\\s\\S]+?)';
      fields.push(match[1]);
      cursor = match.index + match[0].length;
    }
    return {
      key,
      source,
      fields,
      regex: new RegExp('^' + pattern + escapePattern(source.slice(cursor)) + '$'),
    };
  }),
);
export function localizeDiagnostic(message: string, depth = 0): string {
  if (!message || depth > 4) return message;
  // Exact messages win over templates (e.g. a specific engine error).
  const exact = diagnosticPatterns.find(
    (entry) => !entry.fields.length && entry.source === message,
  );
  if (exact) return t(exact.key);
  for (const { key, fields, regex } of diagnosticPatterns) {
    if (!fields.length) continue;
    const match = regex.exec(message);
    if (!match) continue;
    const values = Object.fromEntries(
      fields.map((field, index) => [
        field,
        field === 'detail' || field === 'artifact' || field === 'model'
          ? localizeDiagnostic(match[index + 1], depth + 1)
          : match[index + 1],
      ]),
    );
    return t(key, values);
  }
  // Native engines may append unstructured diagnostics after a known summary.
  const newline = message.indexOf('\n');
  if (newline >= 0)
    return localizeDiagnostic(message.slice(0, newline), depth + 1) + message.slice(newline);
  return message;
}

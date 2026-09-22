import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { UiLanguage } from '../shared/types';
import { createTranslator, normalizeUiLanguage, UI_LANGUAGE_CACHE_KEY, type Translate } from '../shared/i18n';
import { api, errorMessage } from './bridge';

export function cachedUiLanguage(): UiLanguage {
  try { return normalizeUiLanguage(localStorage.getItem(UI_LANGUAGE_CACHE_KEY)); }
  catch { return 'zh-CN'; }
}
function renderLanguage(language: UiLanguage) {
  document.documentElement.lang = language;
  try { localStorage.setItem(UI_LANGUAGE_CACHE_KEY, language); } catch { /* Settings remain authoritative. */ }
}
export function bootstrapLanguage() { renderLanguage(cachedUiLanguage()); }
const LanguageContext = createContext<{
  language: UiLanguage;
  t: Translate;
  saving: boolean;
  error: string;
  setLanguage: (language: UiLanguage) => Promise<void>;
}>({ language: 'zh-CN', t: createTranslator('zh-CN'), saving: false, error: '', setLanguage: async () => {} });

export function LanguageProvider({ children, initialLanguage }: PropsWithChildren<{ initialLanguage?: UiLanguage }>) {
  const [language, setValue] = useState(initialLanguage ?? cachedUiLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0), pending = useRef(0), readSequence = useRef(0);
  const apply = useCallback((value: UiLanguage) => { setValue(value); renderLanguage(value); }, []);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      if (pending.current) return;
      const read = ++readSequence.current, expected = revision.current;
      try {
        const value = await api.getUiLanguage();
        if (!disposed && read === readSequence.current && expected === revision.current && !pending.current) apply(normalizeUiLanguage(value));
      } catch (e) {
        if (!disposed && expected === revision.current) setError(errorMessage(e));
      }
    };
    void refresh();
    const off = api.onChanged(() => void refresh());
    return () => { disposed = true; off(); };
  }, [apply]);
  const setLanguage = useCallback(async (next: UiLanguage) => {
    const value = normalizeUiLanguage(next), expected = ++revision.current;
    pending.current++;
    setSaving(true); setError(''); apply(value);
    try {
      const saved = await api.saveUiLanguage(value);
      if (expected === revision.current) apply(normalizeUiLanguage(saved));
    } catch (e) {
      if (expected === revision.current) {
        setError(errorMessage(e));
        try { const saved = await api.getUiLanguage(); if (expected === revision.current) apply(normalizeUiLanguage(saved)); } catch { /* Keep preview and show failure. */ }
      }
    } finally {
      pending.current--;
      if (expected === revision.current) setSaving(false);
    }
  }, [apply]);
  return <LanguageContext.Provider value={{ language, t: createTranslator(language), saving, error, setLanguage }}>{children}</LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }

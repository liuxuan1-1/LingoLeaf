import type { UiLanguage } from './types';
import { localeCatalogs } from './locales';

export const UI_LANGUAGE_CACHE_KEY = 'lingoleaf-ui-language';
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-CN';
export const UI_LANGUAGES: { value: UiLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' }, { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' }, { value: 'es', label: 'Español' },
];
export type TranslationValues = Record<string, string | number>;
export type Translate = (chinese: string, english: string, values?: TranslationValues) => string;
export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGES.some((item) => item.value === value) ? value as UiLanguage : DEFAULT_UI_LANGUAGE;
}
export function translate(language: UiLanguage, chinese: string, english: string, values?: TranslationValues): string {
  const source = language === 'zh-CN' ? chinese : language === 'en' ? english : (localeCatalogs[language][english] ?? english);
  return source.replace(/\{(\w+)\}/g, (match, key: string) => values?.[key] === undefined ? match : String(values[key]));
}
export function createTranslator(language: UiLanguage): Translate {
  return (chinese, english, values) => translate(language, chinese, english, values);
}

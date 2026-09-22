import type { AppState, LingoAPI } from '../shared/types';
import { APPEARANCE_CACHE_KEY, normalizeAppearance } from '../shared/appearance';
import { createTranslator, normalizeUiLanguage, UI_LANGUAGE_CACHE_KEY } from '../shared/i18n';
import { localizeMessage } from '../shared/messages';

function currentUiLanguage() {
  try { return normalizeUiLanguage(localStorage.getItem(UI_LANGUAGE_CACHE_KEY) || document.documentElement.lang); }
  catch { return normalizeUiLanguage(typeof document === 'undefined' ? undefined : document.documentElement.lang); }
}

export const isPreview = !window.lingo;
const previewState: AppState = {
  version: '0.4.0',
  entries: [],
  shortcuts: { grammar: false, translate: false },
  settings: {
    provider: 'openai',
    uiLanguage: 'zh-CN',
    theme: 'forest',
    fontSize: 'large',
    requestProtocol: 'auto',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    apiKey: '',
    hasApiKey: false,
    azureApiVersion: '2024-10-21',
    targetLanguage: 'English',
    explanationLanguage: '简体中文',
    grammarShortcut: 'Control+Shift+G',
    translateShortcut: 'Control+Shift+T',
    libraryPath: '',
    autoReplace: true,
    launchAtLogin: false,
    saveCorrectSentences: false,
  },
};
const desktopRequired = async (): Promise<never> => {
  const t = createTranslator(currentUiLanguage());
  throw new Error(
    t('请在 LingoLeaf Windows 桌面应用中使用此功能。浏览器预览不会调用模型或保存笔记。', 'Use this feature in the LingoLeaf Windows desktop app. The browser preview does not call models or save notes.'),
  );
};
const preview: LingoAPI = {
  getUiLanguage: async () => currentUiLanguage(),
  saveUiLanguage: async (value) => {
    const language = normalizeUiLanguage(value);
    localStorage.setItem(UI_LANGUAGE_CACHE_KEY, language);
    return language;
  },
  getAppearance: async () => {
    try {
      return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) || 'null'));
    } catch {
      return normalizeAppearance(null);
    }
  },
  saveAppearance: async (value) => {
    const appearance = normalizeAppearance(value);
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(appearance));
    return appearance;
  },
  getState: async () => ({ ...structuredClone(previewState), settings: { ...previewState.settings, uiLanguage: currentUiLanguage() } }),
  analyze: desktopRequired,
  ask: desktopRequired,
  saveSettings: desktopRequired,
  testProvider: desktopRequired,
  chooseLibrary: desktopRequired,
  openLibrary: desktopRequired,
  review: desktopRequired,
  deleteEntry: desktopRequired,
  copy: async (text) => {
    await navigator.clipboard.writeText(text);
  },
  replace: desktopRequired,
  mobileStart: desktopRequired,
  mobileStop: desktopRequired,
  mobileStatus: async () => ({ running: false, urls: [] }),
  exportLibrary: desktopRequired,
  minimize: () => {},
  close: () => {},
  openMain: () => {},
  onResult: () => () => {},
  onChanged: () => () => {},
};
export const api: LingoAPI = window.lingo || preview;
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return localizeMessage(message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ''), currentUiLanguage());
}

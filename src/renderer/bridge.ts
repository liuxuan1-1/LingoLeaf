import type { AppState, LingoAPI } from '../shared/types';

export const isPreview = !window.lingo;
const previewState: AppState = {
  version: '0.1.0', entries: [], shortcuts: { grammar: false, translate: false },
  settings: {
    provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini',
    apiKey: '', hasApiKey: false, azureApiVersion: '2024-10-21', targetLanguage: 'English',
    explanationLanguage: '简体中文', grammarShortcut: 'Control+Shift+G', translateShortcut: 'Control+Shift+T',
    libraryPath: '', autoReplace: true, launchAtLogin: false, saveCorrectSentences: false,
  },
};
const desktopRequired = async (): Promise<never> => { throw new Error('请在 LingoLeaf Windows 桌面应用中使用此功能。浏览器预览不会调用模型或保存笔记。'); };
const preview: LingoAPI = {
  getState: async () => structuredClone(previewState), analyze: desktopRequired,
  saveSettings: desktopRequired, testProvider: desktopRequired, chooseLibrary: desktopRequired,
  openLibrary: desktopRequired, review: desktopRequired, deleteEntry: desktopRequired,
  copy: async text => { await navigator.clipboard.writeText(text); }, replace: desktopRequired,
  mobileStart: desktopRequired, mobileStop: desktopRequired,
  mobileStatus: async () => ({ running: false, urls: [] }), exportLibrary: desktopRequired,
  minimize: () => {}, close: () => {}, openMain: () => {}, onResult: () => () => {}, onChanged: () => () => {},
};
export const api: LingoAPI = window.lingo || preview;
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

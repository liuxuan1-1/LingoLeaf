export type Mode = 'grammar' | 'translate';
export type Provider = 'openai' | 'anthropic' | 'azure' | 'ollama' | 'compatible';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export interface Issue {
  original: string;
  replacement: string;
  explanation: string;
  rule: string;
  kind: 'grammar' | 'style';
}
export interface Analysis {
  mode: Mode;
  original: string;
  corrected: string;
  isCorrect: boolean;
  explanation: string;
  issues: Issue[];
  tags: string[];
  example: string;
}
export interface Review {
  dueAt: string;
  interval: number;
  ease: number;
  repetitions: number;
  lastReviewedAt: string | null;
}
export interface Entry extends Analysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  review: Review;
  sourceLanguage: string;
  targetLanguage: string;
}
export interface Settings {
  provider: Provider;
  endpoint: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  azureApiVersion: string;
  targetLanguage: string;
  explanationLanguage: string;
  grammarShortcut: string;
  translateShortcut: string;
  libraryPath: string;
  autoReplace: boolean;
  launchAtLogin: boolean;
  saveCorrectSentences: boolean;
  clearApiKey?: boolean;
}
export interface AppState {
  settings: Settings;
  entries: Entry[];
  shortcuts: { grammar: boolean; translate: boolean };
  version: string;
  syncError?: string | null;
}
export interface Capture {
  text: string;
  hwnd: string;
  processId: number;
  selectionId?: string;
}
export interface ResultEvent {
  status: 'loading' | 'done' | 'error';
  mode: Mode;
  original?: string;
  result?: Analysis;
  entryId?: string;
  message?: string;
  canReplace?: boolean;
  replaced?: boolean;
}
export interface MobileStatus {
  running: boolean;
  urls: string[];
  qrDataUrl?: string;
  token?: string;
}
export interface LingoAPI {
  getState(): Promise<AppState>;
  analyze(text: string, mode: Mode): Promise<Analysis>;
  saveSettings(settings: Settings): Promise<Settings>;
  testProvider(settings: Settings): Promise<string>;
  chooseLibrary(): Promise<string | null>;
  openLibrary(): Promise<void>;
  review(id: string, rating: Rating): Promise<Entry>;
  deleteEntry(id: string): Promise<void>;
  copy(text: string): Promise<void>;
  replace(): Promise<{ ok: boolean; message: string }>;
  mobileStart(): Promise<MobileStatus>;
  mobileStop(): Promise<MobileStatus>;
  mobileStatus(): Promise<MobileStatus>;
  exportLibrary(): Promise<string | null>;
  minimize(): void;
  close(): void;
  openMain(): void;
  onResult(callback: (result: ResultEvent) => void): () => void;
  onChanged(callback: () => void): () => void;
}
declare global {
  interface Window {
    lingo: LingoAPI;
  }
}

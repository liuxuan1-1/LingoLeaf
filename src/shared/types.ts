export type Mode = 'grammar' | 'translate' | 'read' | 'express';
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'es';
export interface ProfessionalExpression {
  text: string;
  explanation: string;
  improvements: string[];
}
export interface ExpressionOptions {
  context?: string;
  tone?: string;
}
export interface GrammarPoint {
  text: string;
  explanation: string;
}
export interface ExpressionAlternative {
  text: string;
  tone: string;
  explanation: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface ConversationTurn {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}
export type Provider = 'openai' | 'anthropic' | 'azure' | 'ollama' | 'compatible';
export type RequestProtocol = 'auto' | 'chat-completions' | 'responses';
export type Theme = 'system' | 'forest' | 'ocean' | 'lavender' | 'midnight';
export type FontSize = 'standard' | 'large' | 'extra-large';
export interface AppearanceSettings {
  theme: Theme;
  fontSize: FontSize;
}
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
  translation?: string;
  translationLanguage?: string;
  isCorrect: boolean;
  explanation: string;
  issues: Issue[];
  tags: string[];
  example: string;
  grammarPoints?: GrammarPoint[];
  keyPoints?: string[];
  alternatives?: ExpressionAlternative[];
  clarificationQuestions?: string[];
  expressionContext?: string;
  expressionTone?: string;
  professional?: ProfessionalExpression;
}
export interface AnalysisResult extends Analysis {
  entryId?: string;
}
export interface TutorRequest {
  analysis: Analysis;
  entryId?: string;
  history: ChatMessage[];
  question: string;
}
export interface TutorResponse {
  answer: string;
  entry?: Entry;
  syncError?: string | null;
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
  conversation?: ConversationTurn[];
}
export interface Settings {
  uiLanguage?: UiLanguage;
  theme?: Theme;
  fontSize?: FontSize;
  provider: Provider;
  endpoint: string;
  requestProtocol?: RequestProtocol;
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
  getUiLanguage(): Promise<UiLanguage>;
  saveUiLanguage(language: UiLanguage): Promise<UiLanguage>;
  getAppearance(): Promise<AppearanceSettings>;
  saveAppearance(appearance: AppearanceSettings): Promise<AppearanceSettings>;
  getState(): Promise<AppState>;
  analyze(text: string, mode: Mode, options?: ExpressionOptions): Promise<AnalysisResult>;
  ask(request: TutorRequest): Promise<TutorResponse>;
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

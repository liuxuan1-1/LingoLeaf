import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Entry, Settings, UiLanguage } from '../src/shared/types';
import { LanguageProvider } from '../src/renderer/i18n';
import { App } from '../src/renderer/App';
import { SettingsPage } from '../src/renderer/Settings';
import { Library } from '../src/renderer/Library';
import { ReviewPage } from '../src/renderer/Review';
import { MobilePage } from '../src/renderer/Mobile';
import { Popup } from '../src/renderer/Popup';
import { AppearanceCard } from '../src/renderer/AppearanceCard';

vi.mock('../src/renderer/bridge', () => ({ api: {}, isPreview: false, errorMessage: (e: unknown) => String(e) }));

const settings: Settings = {
  uiLanguage: 'en', provider: 'compatible', endpoint: 'https://example.test/v1', model: 'example-model',
  apiKey: '', hasApiKey: false, requestProtocol: 'auto', azureApiVersion: '',
  targetLanguage: 'English', explanationLanguage: '日本語',
  grammarShortcut: 'Control+Shift+G', translateShortcut: 'Control+Shift+T', libraryPath: 'C:\\notes',
  autoReplace: false, launchAtLogin: false, saveCorrectSentences: true,
};
const entry: Entry = {
  id: 'note-localization', mode: 'read', original: 'Keep the original sentence.', corrected: '保留模型生成的译文。',
  explanation: 'This is model content.', isCorrect: true, issues: [], tags: ['原始标签'], example: '',
  createdAt: '2026-09-22T12:00:00Z', updatedAt: '2026-09-22T12:00:00Z', sourceLanguage: 'English', targetLanguage: '日本語',
  review: { dueAt: '2026-09-21T00:00:00Z', repetitions: 0, ease: 2.5, interval: 0, lastReviewedAt: null },
};
const noop = () => {};
const done = async () => {};
const render = (content: ReactNode, language: UiLanguage = 'en') =>
  renderToStaticMarkup(<LanguageProvider initialLanguage={language}>{content}</LanguageProvider>);

describe('desktop interface language', () => {
  it('offers all six UI languages separately from learning languages and localizes settings', () => {
    const html = render(<SettingsPage settings={settings} initialDraft={null} onDraft={noop}
      shortcuts={{ grammar: false, translate: false }} notify={noop} onSaved={noop} refresh={done} />);
    for (const label of ['Interface language', 'Model connection', 'Translation target language', 'Explanation language', 'Test connection', 'Save settings']) {
      expect(html).toContain(label);
    }
    for (const value of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es']) expect(html).toContain(`value="${value}"`);
    expect(html).toContain('value="日本語"');
    expect(html).toContain('Supports OpenAI Chat Completions and Responses APIs.');
    expect(html).not.toContain('Copilot Bridge');
    // Native language names and the learning-language input are deliberate content.
    const withoutLanguages = html.replace(/<option\b[^>]*>[\s\S]*?<\/option>/g, '').replace(/(?:value|placeholder)="[^"<>]*"/g, '');
    expect(withoutLanguages).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('localizes all appearance labels without changing the English sample sentence', () => {
    const html = render(<AppearanceCard />);
    for (const label of ['Appearance and reading', 'Forest cream', 'Ocean blue', 'Lavender', 'Midnight', 'Follow system', 'Text size', 'Extra large', 'Restore defaults']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Every sentence is a small step forward.');
    expect(html).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('localizes the library and preserves user and model content verbatim', () => {
    const html = render(<Library entries={[entry]} notify={noop} onPractice={noop} onReview={noop} onExport={done} refresh={done} />);
    for (const label of ['My library', 'Search learning notes', 'Filter by tag', 'Newest first', '1 notes', 'Delete note']) expect(html).toContain(label);
    expect(html).toContain(entry.original);
    expect(html).toContain(entry.corrected);
    expect(html).toContain('原始标签');
    expect(html.replaceAll(entry.corrected, '').replaceAll('原始标签', '')).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('localizes empty library, active review and completed review states', () => {
    const empty = render(<Library entries={[]} notify={noop} onPractice={noop} onReview={noop} onExport={done} refresh={done} />);
    expect(empty).toContain('Start your library with one sentence');
    expect(empty).not.toMatch(/[\p{Script=Han}]/u);
    const active = render(<ReviewPage entries={[entry]} notify={noop} updateEntry={noop} onPractice={noop} now={Date.parse('2026-09-22')} />);
    expect(active).toContain('Recall the meaning, structure and key points');
    expect(active).toContain('Reveal answer');
    expect(active).toContain('1 remaining');
    expect(active).not.toMatch(/[\p{Script=Han}]/u);
    const emptyReview = render(<ReviewPage entries={[]} notify={noop} updateEntry={noop} onPractice={noop} now={Date.parse('2026-09-22')} />);
    expect(emptyReview).toContain('Collect first, then review.');
    expect(emptyReview).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('localizes the mobile instructions, popup loading and app startup', () => {
    const mobile = render(<MobilePage settings={settings} notify={noop} onSettings={noop} onExport={done} />);
    expect(mobile).toContain('Enable mobile learning');
    expect(mobile).toContain('Sync notes with your cloud drive');
    expect(mobile).not.toMatch(/[\p{Script=Han}]/u);
    const popup = render(<Popup />);
    expect(popup).toContain('Reading your sentence closely…');
    expect(popup).not.toMatch(/[\p{Script=Han}]/u);
    const startup = render(<App />);
    expect(startup).toContain('Opening your learning space…');
    expect(startup).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('keeps Simplified Chinese as the backwards-compatible default', () => {
    const html = renderToStaticMarkup(<AppearanceCard />);
    expect(html).toContain('外观与阅读');
    expect(html).toContain('午夜深色');
    expect(html).toContain('即时生效 · 自动保存');
  });
});

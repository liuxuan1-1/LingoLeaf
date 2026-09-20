import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Analysis, Entry, Settings } from '../src/shared/types';
import { ResultView } from '../src/renderer/components';
import { Workbench } from '../src/renderer/Workbench';
import { Library } from '../src/renderer/Library';
import { ReviewPage } from '../src/renderer/Review';
import { entrySearchText, MODE_INFO, MODES } from '../src/renderer/modes';

vi.mock('../src/renderer/bridge', () => ({ api: {}, errorMessage: (e: unknown) => String(e) }));

const analysis: Analysis = {
  mode: 'read', original: 'Had I known, I would have left.',
  corrected: '如果我早知道，\n\n\t我就会离开。<script>literal</script>',
  isCorrect: true, explanation: '对过去的假设。', issues: [], tags: [], example: '',
  grammarPoints: [{ text: 'Had I known', explanation: '省略 if 的倒装。' }],
  keyPoints: ['对过去事实的假设。', '说话者当时不知道。'],
};
const settings: Settings = {
  provider: 'compatible', endpoint: 'http://localhost:1234/v1', model: 'test', apiKey: '',
  hasApiKey: false, azureApiVersion: '', targetLanguage: 'English', explanationLanguage: '简体中文',
  grammarShortcut: 'Ctrl+Shift+G', translateShortcut: 'Ctrl+Shift+T', libraryPath: '',
  autoReplace: false, launchAtLogin: false, saveCorrectSentences: false,
};
const entry: Entry = {
  ...analysis, id: 'reading-note', createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
  sourceLanguage: 'English', targetLanguage: '简体中文',
  review: { dueAt: '2026-09-19T00:00:00Z', interval: 0, ease: 2.5, repetitions: 0, lastReviewedAt: null },
  conversation: [{ id: 'turn-1', question: '是否可以恢复if？', answer: '可以用 If I had known。', createdAt: '2026-09-20T00:00:00Z' }],
};

describe('learning result presentation', () => {
  it('renders reading translation, grammar and summary without a grammar-verdict fallback', () => {
    const html = renderToStaticMarkup(<ResultView result={analysis} />);
    expect(html).toContain('读懂意思，也理解结构');
    expect(html).toContain('语法解析');
    expect(html).toContain('省略 if 的倒装。');
    expect(html).toContain('要点摘要');
    expect(html).toContain('说话者当时不知道。');
    expect(html).not.toContain('语法没有错误');
    expect(html).not.toContain('建议表达');
    expect(html).toContain('如果我早知道，\n\n\t我就会离开。&lt;script&gt;literal&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows expression choices with their separate tone, wording and distinction', () => {
    const html = renderToStaticMarkup(<ResultView result={{ ...analysis, mode: 'express',
      grammarPoints: undefined, keyPoints: undefined, expressionContext: '和同事沟通', expressionTone: '委婉',
      alternatives: [{ text: 'Could we revisit this next week?', tone: '正式、客气', explanation: '以提议形式延后。' }],
      clarificationQuestions: ['截止时间是什么？'],
    }} />);
    for (const text of ['推荐表达', '其他表达与区别', '正式、客气', 'Could we revisit this next week?', '以提议形式延后。', '截止时间是什么？', '和同事沟通', '委婉']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('语法没有错误');
  });

  it('still shows historical grammar translation and makes an inline follow-up available', () => {
    const html = renderToStaticMarkup(<ResultView result={{ ...analysis, mode: 'grammar', translation: '这是旧句意。', translationLanguage: '简体中文' }} />);
    expect(html).toContain('句意 · 简体中文');
    expect(html).toContain('这是旧句意。');
    expect(html).toContain('还想问问？');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });

  it('shows saved conversation count without opening a second dialog', () => {
    const html = renderToStaticMarkup(<ResultView result={entry} />);
    expect(html).toContain('1 轮对话');
    expect(html).not.toContain('aria-modal');
  });
});

describe('four-mode practice and library', () => {
  it('exposes all four keyboard-selectable practice tabs', () => {
    const html = renderToStaticMarkup(<Workbench settings={settings} notify={() => {}} onSettings={() => {}} initial={null} onDone={async () => {}} />);
    for (const mode of MODES) {
      expect(html).toContain(`id="mode-${mode}"`);
      expect(html).toContain(MODE_INFO[mode].label);
    }
    expect((html.match(/role="tab"/g) || []).length).toBe(4);
    expect((html.match(/aria-selected="true"/g) || []).length).toBe(1);
    expect(html).toContain('role="tabpanel"');
  });

  it('labels reading and expression notes and exposes their own filters', () => {
    const html = renderToStaticMarkup(<Library entries={[entry, { ...entry, id: 'expression', mode: 'express' }]} notify={() => {}} onPractice={() => {}} onReview={() => {}} onExport={async () => {}} refresh={async () => {}} />);
    expect(html).toContain('阅读笔记');
    expect(html).toContain('表达笔记');
    expect(html).toContain('阅读解析');
    expect(html).toContain('帮我表达');
  });

  it('finds new learning fields and saved follow-ups through the existing library search', () => {
    const text = entrySearchText({ ...entry, expressionContext: '一个场景', expressionTone: '一个语气',
      alternatives: [{ text: 'A Different Phrase', tone: 'Casual', explanation: '一个区别' }],
      clarificationQuestions: ['一个澄清问题'],
    });
    for (const query of ['省略 if 的倒装', '对过去事实', '恢复if', 'if i had known', '一个场景', '一个语气', 'a different phrase', 'casual', '一个区别', '一个澄清问题']) {
      expect(text).toContain(query);
    }
  });

  it('asks readers to recall meaning and structure, not to correct their original', () => {
    const html = renderToStaticMarkup(<ReviewPage entries={[entry]} notify={() => {}} updateEntry={() => {}} onPractice={() => {}} now={Date.parse('2026-09-20T00:00:00Z')} />);
    expect(html).toContain('回想句意、语法结构与要点');
    expect(html).not.toContain('找到语法问题');
  });
});

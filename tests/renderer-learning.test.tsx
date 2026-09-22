import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Analysis, Entry, Settings } from '../src/shared/types';
import { formatDate, ResultView } from '../src/renderer/components';
import { Workbench } from '../src/renderer/Workbench';
import { Library } from '../src/renderer/Library';
import { ReviewPage } from '../src/renderer/Review';
import { entrySearchText, getModeInfo, MODES } from '../src/renderer/modes';
import { LanguageProvider } from '../src/renderer/i18n';

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

  it('separates the optional professional version from the grammar correction and escapes its content', () => {
    const result: Analysis = { ...analysis, mode: 'grammar', corrected: 'I agree with you.',
      grammarPoints: undefined, keyPoints: undefined, isCorrect: true,
      professional: { text: 'I share your perspective.\n\n<script>literal</script>', explanation: '更正式的措辞。', improvements: ['share your perspective 适合专业交流。'] },
    };
    const html = renderToStaticMarkup(<ResultView result={result} />);
    expect(html).toContain('这句话，语法没有错误');
    expect(html).toContain('语法修正');
    expect(html).toContain('I agree with you.');
    expect(html).toContain('更正式／专业的表达');
    expect(html).toContain('复制专业表达');
    expect(html).toContain('可选的风格提升，不代表原句存在语法错误');
    expect(html).toContain('share your perspective 适合专业交流。');
    expect(html).toContain('I share your perspective.\n\n&lt;script&gt;literal&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html.indexOf('I agree with you.')).toBeLessThan(html.indexOf('I share your perspective.'));
  });

  it('keeps historical grammar notes readable without inventing a professional version', () => {
    const html = renderToStaticMarkup(<ResultView result={{ ...analysis, mode: 'grammar' }} />);
    expect(html).not.toContain('复制专业表达');
    expect(html).not.toContain('professional-section');
  });

  it('never counts a style-only issue as a grammar error', () => {
    const html = renderToStaticMarkup(<ResultView result={{ ...analysis, mode: 'grammar', isCorrect: false,
      issues: [{ kind: 'style', original: 'get', replacement: 'receive', rule: '', explanation: '正式场合更常见。' }],
    }} />);
    expect(html).not.toContain('发现 1 处可以改进的语法');
    expect(html).toContain('风格建议');
  });

  it('localizes interface text while keeping the model output and explanation language intact', () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLanguage="en"><ResultView result={{ ...analysis, mode: 'grammar',
      translation: '保留模型输出，不自动翻译。', translationLanguage: '简体中文',
      professional: { text: 'I share your perspective.', explanation: '保留中文讲解。', improvements: ['一个要点'] },
    }} /></LanguageProvider>);
    expect(html).toContain('Grammar correction');
    expect(html).toContain('A more professional expression');
    expect(html).toContain('Copy professional version');
    expect(html).toContain('Any more questions?');
    expect(html).toContain('Meaning · 简体中文');
    expect(html).toContain('保留模型输出，不自动翻译。');
    expect(html).toContain('保留中文讲解。');
    expect(html).not.toContain('复制专业表达');
  });
});

describe('three-task practice and four-mode library', () => {
  it('exposes three explicit tasks with a single selected, focusable task', () => {
    const html = renderToStaticMarkup(<Workbench settings={settings} notify={() => {}} onSettings={() => {}} initial={null} onDone={async () => {}} />);
    for (const task of ['grammar', 'read', 'express']) {
      expect(html).toContain(`id="task-${task}"`);
    }
    for (const label of ['修改英文', '读懂外语', '表达想法']) expect(html).toContain(label);
    expect((html.match(/role="tab"/g) || []).length).toBe(3);
    expect((html.match(/aria-selected="true"/g) || []).length).toBe(1);
    expect((html.match(/tabindex="-1"/g) || []).length).toBe(2);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="task-grammar"');
    expect(html).not.toContain('id="task-translate"');
  });

  it.each(['translate', 'express'] as const)('opens a saved %s practice inside the shared expression task', (mode) => {
    const html = renderToStaticMarkup(<Workbench settings={settings} notify={() => {}} onSettings={() => {}}
      initial={{ mode, text: 'saved original <literal>', key: 1, options: { context: 'saved audience', tone: 'saved tone' } }} onDone={async () => {}} />);
    expect(html).toContain('aria-labelledby="task-express"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('已有完整原文');
    expect(html).toContain('只有大致想法');
    expect(html).toContain(`id="expression-${mode}" role="radio" aria-checked="true"`);
    expect(html).toContain('saved original &lt;literal&gt;');
    if (mode === 'express') {
      expect(html).toContain('saved audience');
      expect(html).toContain('saved tone');
    }
  });

  it('opens reading practice directly without changing the configured source and explanation languages', () => {
    const html = renderToStaticMarkup(<LanguageProvider initialLanguage="en"><Workbench settings={settings}
      notify={() => {}} onSettings={() => {}} initial={{ mode: 'read', text: analysis.original, key: 1 }} onDone={async () => {}} /></LanguageProvider>);
    expect(html).toContain('aria-labelledby="task-read"');
    expect(html).toContain('Understand a text');
    expect(html).toContain('English → 简体中文');
    expect(html).toContain(analysis.original);
    expect(html).not.toContain('今天想做什么');
  });

  it('labels reading and expression notes and exposes their own filters', () => {
    const html = renderToStaticMarkup(<Library entries={[entry, { ...entry, id: 'expression', mode: 'express' }]} notify={() => {}} onPractice={() => {}} onReview={() => {}} onExport={async () => {}} refresh={async () => {}} />);
    expect(html).toContain('阅读笔记');
    expect(html).toContain('表达笔记');
    expect(html).toContain('阅读解析');
    expect(html).toContain('组织想法');
  });

  it('finds new learning fields and saved follow-ups through the existing library search', () => {
    const text = entrySearchText({ ...entry, expressionContext: '一个场景', expressionTone: '一个语气',
      alternatives: [{ text: 'A Different Phrase', tone: 'Casual', explanation: '一个区别' }],
      clarificationQuestions: ['一个澄清问题'], professional: { text: 'Professional Variant', explanation: '改写依据', improvements: ['专业要点'] },
    });
    for (const query of ['省略 if 的倒装', '对过去事实', '恢复if', 'if i had known', '一个场景', '一个语气', 'a different phrase', 'casual', '一个区别', '一个澄清问题', 'professional variant', '改写依据', '专业要点']) {
      expect(text).toContain(query);
    }
  });

  it('asks readers to recall meaning and structure, not to correct their original', () => {
    const html = renderToStaticMarkup(<ReviewPage entries={[entry]} notify={() => {}} updateEntry={() => {}} onPractice={() => {}} now={Date.parse('2026-09-20T00:00:00Z')} />);
    expect(html).toContain('回想句意、语法结构与要点');
    expect(html).not.toContain('找到语法问题');
  });

  it('keeps all four underlying modes and formats dates in the chosen locale', () => {
    expect(MODES).toEqual(['grammar', 'translate', 'read', 'express']);
    expect(getModeInfo('en').translate.label).toBe('Translate a text');
    expect(getModeInfo('en').express.label).toBe('Shape an idea');
    expect(getModeInfo('en').grammar.note).toBe('Grammar note');
    expect(formatDate('2026-09-20T12:00:00Z', 'es')).toBe(new Date('2026-09-20T12:00:00Z').toLocaleDateString('es', { month: 'short', day: 'numeric' }));
  });
});

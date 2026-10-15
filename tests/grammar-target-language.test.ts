import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { analysisSchema, analyzeText } from '../src/main/providers';
import type { Provider, Settings } from '../src/shared/types';

const settings: Settings = {
  provider: 'compatible', endpoint: 'http://127.0.0.1:9000/v1', requestProtocol: 'chat-completions',
  model: 'test-model', apiKey: 'fake-test-key', hasApiKey: true,
  azureApiVersion: '2024-10-21', targetLanguage: 'English', explanationLanguage: '简体中文',
  grammarShortcut: 'Ctrl+Shift+G', translateShortcut: 'Ctrl+Shift+T', libraryPath: '',
  autoReplace: false, launchAtLogin: false, saveCorrectSentences: true,
};
const output = {
  corrected: 'She goes to school every day.', translation: '她每天都去上学。', isCorrect: true,
  explanation: '原有英文没有语法错误；将“每一天”表达为 every day。', issues: [],
  tags: ['日常习惯'], example: 'He walks to work every day.',
  professional: {
    text: 'She attends school every day.', explanation: 'attends school 是较正式的表达。',
    improvements: ['用 every day 表达“每一天”。'],
  },
};

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => { fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request')); });
afterEach(() => { vi.restoreAllMocks(); });

function respond(value: unknown, provider: Provider = 'compatible', responses = false) {
  const text = JSON.stringify(value);
  const body = responses
    ? { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }] }
    : provider === 'anthropic'
      ? { content: [{ type: 'text', text }], stop_reason: 'end_turn' }
      : provider === 'ollama'
        ? { message: { role: 'assistant', content: text }, done: true }
        : { choices: [{ message: { content: text }, finish_reason: 'stop' }] };
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
}
function request() { return JSON.parse(fetchMock.mock.calls[0][1]!.body as string); }
function prompt() { return request().system ?? request().messages[0].content; }

describe('grammar correction into the configured target language', () => {
  it.each(['She goes to school 每一天', '她每天都去上学。'])(
    'keeps the complete target-language wording when no objective grammar error exists: %s', async (original) => {
      respond({ ...output, needsTranslation: true });
      const result = await analyzeText(original, 'grammar', settings);
      expect(result).toMatchObject({
        original, corrected: 'She goes to school every day.', isCorrect: true, issues: [],
        translation: '她每天都去上学。', translationLanguage: '简体中文',
      });
      expect(result).not.toHaveProperty('needsTranslation');
      expect(analysisSchema.parse(result)).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('fixes an actual grammar error and translates the missing expression in the same result', async () => {
    const original = 'she go to school 每一天';
    const issue = {
      original: 'go', replacement: 'goes', kind: 'grammar', rule: '主谓一致',
      explanation: '第三人称单数主语 she 后使用 goes。',
    };
    respond({ ...output, needsTranslation: true, isCorrect: false, issues: [issue] });
    const result = await analyzeText(original, 'grammar', settings);
    expect(result).toMatchObject({ original, corrected: output.corrected, isCorrect: false, issues: [issue] });
    expect(result.corrected).not.toContain('每一天');
    expect(request().messages.at(-1).content).toBe(JSON.stringify({ text: original }));
  });

  it.each([
    { original: '她每天都去上学。', targetLanguage: '日本語', corrected: '彼女は毎日学校に行きます。', formal: '彼女は毎日通学しています。' },
    { original: 'She goes to school every day.', targetLanguage: 'Español', corrected: 'Ella va a la escuela todos los días.', formal: 'Ella asiste a la escuela todos los días.' },
  ])('uses $targetLanguage rather than assuming the target is English', async ({ original, targetLanguage, corrected, formal }) => {
    const translation = 'Sie geht jeden Tag zur Schule.';
    respond({ ...output, needsTranslation: true, corrected, translation,
      explanation: 'Die ursprüngliche Bedeutung wird in der Zielsprache ausgedrückt.',
      professional: { text: formal, explanation: 'Eine formellere Variante mit derselben Bedeutung.', improvements: ['Die Aussage bleibt unverändert.'] },
    });
    const result = await analyzeText(original, 'grammar', { ...settings, targetLanguage, explanationLanguage: 'Deutsch' });
    expect(result).toMatchObject({ original, corrected, translation, professional: { text: formal }, translationLanguage: 'Deutsch' });
    expect(prompt()).toContain(JSON.stringify(targetLanguage));
    expect(prompt()).toContain('"Deutsch"');
    expect(prompt()).not.toContain('Check English grammar.');
    expect(prompt()).not.toContain('Keep corrected in the original language.');
  });

  it('keeps spoken rewriting separate from the minimally corrected and translated text', async () => {
    const original = 'I will send it 明天.';
    const corrected = 'I will send it tomorrow.';
    const translation = '我明天会发过去。';
    const professional = {
      text: "I'll send it tomorrow.", explanation: '口语中使用缩写更自然。',
      improvements: ['I will 可以缩写为 I’ll；时间和承诺不变。'],
    };
    respond({ ...output, needsTranslation: true, corrected, translation, professional });
    const result = await analyzeText(original, 'grammar', settings, { grammarTone: 'spoken' });
    expect(result).toMatchObject({ original, corrected, translation, professional, grammarTone: 'spoken', isCorrect: true });
    expect(result.corrected).not.toBe(result.professional?.text);
    expect(prompt()).toContain('selected tone "spoken"');
    expect(prompt()).toMatch(/professional[^\n]*target language/);
    expect(prompt()).toMatch(/translation[^\n]*explanation language/);
  });

  it.each([false, undefined])('preserves already-target-language grammar against optional rewrites with needsTranslation=%s', async (needsTranslation) => {
    const original = 'I am very happy.';
    const style = {
      original: 'very happy', replacement: 'delighted', kind: 'style', rule: '可选表达',
      explanation: '原句语法正确，这只是可选词汇变化。',
    };
    respond({ ...output, ...(needsTranslation === undefined ? {} : { needsTranslation }), corrected: 'I am delighted.', issues: [style] });
    const result = await analyzeText(original, 'grammar', settings);
    expect(result).toMatchObject({ original, corrected: original, isCorrect: true, issues: [style] });
    expect(result).not.toHaveProperty('needsTranslation');
  });

  it('does not use foreign names, direct quotations or code as a reason to rewrite correct target-language prose', async () => {
    const original = '李雷 said "明天见". The field is `用户` and the path is /用户.';
    respond({ ...output, needsTranslation: false, corrected: 'Li Lei said "See you tomorrow". The field is `user` and the path is /user.' });
    const result = await analyzeText(original, 'grammar', settings);
    expect(result.corrected).toBe(original);
    expect(prompt()).toMatch(/names/);
    expect(prompt()).toMatch(/quot(?:e|ation)/i);
    expect(prompt()).toMatch(/code/);
    expect(prompt()).toMatch(/needsTranslation/);
  });

  it('preserves layout when translation is needed but grammar is already correct', async () => {
    const original = 'Daily plan:\r\n\r\n1. Go to school 每一天.\r\n   - Study English.';
    const corrected = original.replace('每一天', 'every day');
    respond({ ...output, needsTranslation: true, corrected });
    const result = await analyzeText(original, 'grammar', settings);
    expect(result.corrected).toBe(corrected);
    expect(result.original).toBe(original);
    expect(prompt()).toContain('paragraph breaks, blank lines, list markers');
  });

  it.each<Provider>(['openai', 'compatible', 'azure', 'anthropic', 'ollama'])(
    'carries the mixed-language contract across %s without a second translation request', async (provider) => {
      respond({ ...output, needsTranslation: true }, provider);
      const result = await analyzeText('She goes to school 每一天', 'grammar', { ...settings, provider });
      expect(result.corrected).toBe(output.corrected);
      expect(prompt()).toContain('needsTranslation');
      expect(prompt()).toContain('"English"');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('also preserves the translated correction over the Responses API', async () => {
    respond({ ...output, needsTranslation: true }, 'compatible', true);
    const result = await analyzeText('她每天都去上学。', 'grammar', { ...settings, requestProtocol: 'responses' });
    expect(result.corrected).toBe(output.corrected);
    expect(result).not.toHaveProperty('needsTranslation');
    expect(request().instructions).toContain('needsTranslation');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['true', 1, null, {}, []])('rejects a malformed translation decision instead of treating it as truthy: %j', async (needsTranslation) => {
    respond({ ...output, needsTranslation });
    await expect(analyzeText('她每天都去上学。', 'grammar', settings)).rejects.toThrow('格式');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let translation bypass objective grammar verdict consistency', async () => {
    respond({ ...output, needsTranslation: true, isCorrect: false, issues: [] });
    await expect(analyzeText('她每天都去上学。', 'grammar', settings)).rejects.toThrow('不一致');
  });

  it('still rejects unanchored issue locations after translating mixed-language input', async () => {
    respond({ ...output, needsTranslation: true, issues: [{
      original: 'every day', replacement: 'daily', kind: 'style', rule: '可选表达', explanation: 'daily 更简洁。',
    }] });
    await expect(analyzeText('She goes to school 每一天', 'grammar', settings)).rejects.toThrow('不在原句');
  });
});

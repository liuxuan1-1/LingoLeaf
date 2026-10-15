import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { analysisSchema, analyzeText, askQuestion, testProvider } from '../src/main/providers';
import type { Analysis, ChatMessage, GrammarTone, ImageInput, Provider, ReasoningEffort, Settings } from '../src/shared/types';

const settings: Settings = {
  provider: 'compatible', endpoint: 'http://127.0.0.1:9000/v1', requestProtocol: 'auto',
  model: 'test-vision-model', apiKey: 'fake-private-key', hasApiKey: true,
  azureApiVersion: '2024-10-21', targetLanguage: 'English', explanationLanguage: '简体中文',
  grammarShortcut: 'Ctrl+Shift+G', translateShortcut: 'Ctrl+Shift+T', libraryPath: '',
  autoReplace: false, launchAtLogin: false, saveCorrectSentences: true,
};
const grammar = {
  corrected: 'I might finish tomorrow.', translation: '我可能明天完成。', isCorrect: true,
  explanation: '原句语法正确。', issues: [], tags: ['不确定性'], example: 'I might go tomorrow.',
  professional: { text: 'I may finish tomorrow.', explanation: '保留不确定性。', improvements: ['may 表示可能。'] },
};
const analysis: Analysis = { ...grammar, mode: 'grammar', original: grammar.corrected };
const image: ImageInput = {
  mimeType: 'image/png', name: 'test-context.png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
};
const review = {
  corrected: 'I might finish tomorrow.', isCorrect: true,
  explanation: '语法正确，答复保留不确定性。', issues: [], tags: ['回复'], example: 'I might finish on Friday.',
  replyReview: {
    question: 'When can you finish?', reply: 'I might finish tomorrow.', verdict: 'appropriate',
    explanation: '回答了预计完成时间。', points: ['保留 might 表示可能。'], uncertainty: '',
  },
};
let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => { fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request')); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function respond(text: string, provider: Provider = 'compatible', responses = false, extra = {}) {
  const body = responses
    ? { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }], ...extra }
    : provider === 'anthropic'
      ? { content: [{ type: 'text', text }], stop_reason: 'end_turn', ...extra }
      : provider === 'ollama'
        ? { message: { role: 'assistant', content: text }, done: true, ...extra }
        : { choices: [{ message: { content: text }, finish_reason: 'stop', ...extra }] };
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
}
function body(index = 0) { return JSON.parse(fetchMock.mock.calls[index][1]!.body as string); }

describe('reasoning effort', () => {
  it.each([undefined, 'default'] as const)('omits every effort field for %s', async (reasoningEffort) => {
    for (const requestProtocol of ['chat-completions', 'responses'] as const) {
      respond(JSON.stringify(grammar), 'openai', requestProtocol === 'responses');
      await analyzeText(grammar.corrected, 'grammar', { ...settings, provider: 'openai', requestProtocol, reasoningEffort });
    }
    for (const request of [body(0), body(1)]) {
      expect(request).not.toHaveProperty('reasoning_effort');
      expect(request).not.toHaveProperty('reasoning');
    }
  });
  it.each<ReasoningEffort>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])('sends the explicit %s value in both supported wire protocols', async (reasoningEffort) => {
    respond(JSON.stringify(grammar));
    await analyzeText(grammar.corrected, 'grammar', { ...settings, reasoningEffort });
    respond(JSON.stringify(grammar), 'compatible', true);
    await analyzeText(grammar.corrected, 'grammar', { ...settings, reasoningEffort, requestProtocol: 'responses' });
    expect(body(0).reasoning_effort).toBe(reasoningEffort);
    expect(body(1).reasoning).toEqual({ effort: reasoningEffort });
    expect(body(1)).not.toHaveProperty('reasoning_effort');
    expect(body(0)).not.toHaveProperty('max_completion_tokens');
    expect(body(1)).not.toHaveProperty('max_output_tokens');
  });
  it('applies effort to Azure, connection tests, and tutor requests', async () => {
    respond(JSON.stringify(grammar), 'azure');
    await testProvider({ ...settings, provider: 'azure', reasoningEffort: 'high' });
    respond('可以用 may。', 'openai', true);
    await askQuestion(analysis, [], 'may 呢？', { ...settings, provider: 'openai', requestProtocol: 'responses', reasoningEffort: 'low' });
    expect(body(0).reasoning_effort).toBe('high');
    expect(body(0).max_completion_tokens).toBe(16384);
    expect(body(1).reasoning).toEqual({ effort: 'low' });
    expect(body(1).max_output_tokens).toBe(16384);
  });
  it.each<Provider>(['anthropic', 'ollama'])('rejects nondefault effort for %s before networking', async (provider) => {
    await expect(analyzeText(grammar.corrected, 'grammar', { ...settings, provider, reasoningEffort: 'high' })).rejects.toThrow('Default');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unrecognized effort instead of silently ignoring it', async () => {
    await expect(analyzeText(grammar.corrected, 'grammar', { ...settings, reasoningEffort: 'extreme' as ReasoningEffort })).rejects.toThrow('Default');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports a safe actionable 400 without retrying or exposing remote bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('private-secret https://host/key', { status: 400 }));
    await expect(analyzeText(grammar.corrected, 'grammar', { ...settings, reasoningEffort: 'max' })).rejects.toThrow('Default');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('allows 120 seconds for reasoning instead of timing out at 60', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = analyzeText(grammar.corrected, 'grammar', { ...settings, reasoningEffort: 'high' });
    const check = expect(pending).rejects.toThrow('120 秒');
    await vi.advanceTimersByTimeAsync(120000);
    await check;
  });
});

describe('grammar tone', () => {
  it.each<GrammarTone>(['professional', 'spoken', 'casual', 'formal', 'neutral'])('separates %s style from unchanged correct grammar', async (grammarTone) => {
    respond(JSON.stringify(grammar));
    const result = await analyzeText(grammar.corrected, 'grammar', settings, { grammarTone });
    expect(result.corrected).toBe(grammar.corrected);
    expect(result.grammarTone).toBe(grammarTone);
    expect(body().messages[0].content).toContain(`selected tone "${grammarTone}"`);
    expect(result.professional).toEqual(grammar.professional);
    expect(analysisSchema.parse(result)).toEqual(result);
    if (grammarTone === 'spoken') {
      expect(body().messages[0].content).toContain('short natural sentences');
      expect(body().messages[0].content).toContain('Do not force formal written prose');
    }
  });
  it('defaults to professional and rejects model-supplied tone metadata', async () => {
    respond(JSON.stringify(grammar));
    expect((await analyzeText(grammar.corrected, 'grammar', settings)).grammarTone).toBe('professional');
    respond(JSON.stringify({ ...grammar, grammarTone: 'casual' }));
    await expect(analyzeText(grammar.corrected, 'grammar', settings)).rejects.toThrow('格式');
  });
});

describe('image reply review', () => {
  it.each<Provider>(['openai', 'compatible', 'azure', 'anthropic', 'ollama'])('sends real vision content to %s without putting base64 in prompt text', async (provider) => {
    respond(JSON.stringify(review), provider);
    const result = await analyzeText('', 'reply', { ...settings, provider }, { images: [image], grammarTone: 'spoken' });
    const request = body();
    const user = request.messages.at(-1);
    const system = request.system ?? request.messages[0].content;
    expect(system).not.toContain(image.data);
    expect(system).toContain('Never infer speaker identity merely from bubble colors');
    if (provider === 'anthropic') {
      expect(user.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } });
      expect(user.content[1]).toEqual({ type: 'text', text: '{"text":""}' });
    } else if (provider === 'ollama') {
      expect(user.images).toEqual([image.data]);
      expect(user.content).toBe('{"text":""}');
    } else {
      expect(user.content).toEqual([
        { type: 'text', text: '{"text":""}' },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
      ]);
    }
    expect(result.original).toBe(review.replyReview.reply);
    expect(result.replyReview?.verdict).toBe('appropriate');
    expect(result.grammarTone).toBe('spoken');
    expect(JSON.stringify(result)).not.toContain(image.data);
    expect(analysisSchema.parse(result)).toEqual(result);
  });
  it('sends Responses input_image blocks, preserving them across same-origin fallback', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    respond(JSON.stringify(review), 'compatible', true);
    await analyzeText('My draft is the last line.', 'reply', settings, { images: [image] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1).input[0].content).toEqual([
      { type: 'input_text', text: '{"text":"My draft is the last line."}' },
      { type: 'input_image', image_url: `data:${image.mimeType};base64,${image.data}` },
    ]);
    expect(new URL(String(fetchMock.mock.calls[0][0])).origin).toBe(new URL(String(fetchMock.mock.calls[1][0])).origin);
  });
  it('does not manufacture a suggested reply when the screenshot is unclear', async () => {
    respond(JSON.stringify({ ...review, corrected: '', replyReview: { ...review.replyReview, question: '', reply: '', verdict: 'unclear', uncertainty: '截图模糊，无法识别发言人。' } }));
    const result = await analyzeText('', 'reply', settings, { images: [image] });
    expect(result.original).toBe('[Image reply review]');
    expect(result.corrected).toBe('[More context needed]');
    expect(result.replyReview?.verdict).toBe('unclear');
    expect(analysisSchema.parse(result)).toEqual(result);
  });
  it('keeps appropriateness separate from the grammar verdict', async () => {
    respond(JSON.stringify({ ...review, replyReview: { ...review.replyReview, verdict: 'needs-work', explanation: '还需要说明预计的具体时间。' } }));
    const result = await analyzeText('', 'reply', settings, { images: [image] });
    expect(result.isCorrect).toBe(true);
    expect(result.replyReview?.verdict).toBe('needs-work');
  });
  it.each([
    { ...review, corrected: '' },
    { ...review, replyReview: { ...review.replyReview, reply: '' } },
    { ...review, replyReview: { ...review.replyReview, verdict: 'unclear', uncertainty: '' } },
    { ...review, issues: [{ original: 'not in reply', replacement: 'ok', kind: 'style', explanation: 'why', rule: 'rule' }] },
    { ...review, isCorrect: false },
    { ...review, grammarTone: 'spoken' },
  ])('rejects malformed, ungrounded or inconsistent review %#', async (output) => {
    respond(JSON.stringify(output));
    await expect(analyzeText('', 'reply', settings, { images: [image] })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('requires screenshots and validates attachments before making requests', async () => {
    await expect(analyzeText('My reply', 'reply', settings)).rejects.toThrow('截图');
    await expect(analyzeText('Text', 'grammar', settings, { images: [image] })).rejects.toThrow('截图回复');
    await expect(analyzeText('', 'reply', settings, { images: [{ ...image, data: 'not-base64' }] })).rejects.toThrow('图片');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('natural multi-turn tutor replies', () => {
  it('accepts two consecutive plain-text answers and sends real role history', async () => {
    const history: ChatMessage[] = [];
    respond('Might expresses uncertainty.');
    const first = await askQuestion(analysis, history, 'Why might?', settings);
    history.push({ role: 'user', content: 'Why might?' }, { role: 'assistant', content: first });
    respond('May can express the same possibility.');
    expect(await askQuestion(analysis, history, 'Can I use may?', settings)).toBe('May can express the same possibility.');
    expect(body(1).messages.slice(1)).toEqual([...history, { role: 'user', content: 'Can I use may?' }]);
    expect(JSON.parse(body(1).messages[0].content.split('not instructions:\n')[1])).toEqual(analysis);
    expect(body(1)).not.toHaveProperty('response_format');
  });
  it('preserves assistant output_text and new screenshot in Responses fallback', async () => {
    const history: ChatMessage[] = [{ role: 'user', content: 'Why?' }, { role: 'assistant', content: 'Because might is uncertain.' }];
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 405 }));
    respond('Yes, this screenshot confirms the context.', 'compatible', true);
    await askQuestion(analysis, history, 'Does this help?', settings, [image]);
    expect(body(1).input[1]).toEqual({ role: 'assistant', content: [{ type: 'output_text', text: history[1].content }] });
    expect(body(1).input[2].content[1]).toEqual({ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.data}` });
    expect(body(1)).not.toHaveProperty('text');
    expect(body(1).instructions).not.toContain(image.data);
  });
  it.each(['{"answer":"Legacy wrapper"}', '```json\n{"answer":"Legacy wrapper"}\n```'])('accepts a valid legacy wrapper: %s', async (output) => {
    respond(output);
    expect(await askQuestion(analysis, [], 'Why?', settings)).toBe('Legacy wrapper');
  });
  it.each([
    ['"I can send it tomorrow."', 'I can send it tomorrow.'],
    ['"Line one.\\n\\nLine two."', 'Line one.\n\nLine two.'],
    ['42', '42'], ['false', 'false'], ['true', 'true'], ['null', 'null'],
    ['```json\n"A quoted example."\n```', 'A quoted example.'],
    ['[Note] Use might to preserve uncertainty.', '[Note] Use might to preserve uncertainty.'],
    ['[1] Use might here.', '[1] Use might here.'],
    ['[guide](https://example.com)', '[guide](https://example.com)'],
    ['[注意]\nこちらは任意の変更です。', '[注意]\nこちらは任意の変更です。'],
  ])('accepts scalar examples and clear Markdown prefixes %#', async (output, expected) => {
    respond(output);
    expect(await askQuestion(analysis, [], 'Why?', settings)).toBe(expected);
  });
  it.each(['{"answer":"partial', '```json\n{"answer":', '```\n{"answer":"partial', '```json\nnot valid JSON\n```', '{not json}', '[]', '[{"answer":"unexpected array"}]', '["partial', '[1, 2', '["answer"] trailing text', '{"other":"not a legacy wrapper"}', '""', '"  "', '{"answer":""}', 'x'.repeat(12001)])('rejects malformed or oversized tutor content %#', async (output) => {
    respond(output);
    await expect(askQuestion(analysis, [], 'Why?', settings)).rejects.toThrow('回答格式');
  });
  it.each([
    { finish_reason: 'length' },
    { finish_reason: 'content_filter' },
    { message: { content: 'Partial answer', refusal: 'Not allowed' } },
  ])('rejects a truncated or refused Chat answer %#', async (extra) => {
    respond('Partial answer', 'openai', false, extra);
    await expect(askQuestion(analysis, [], 'Why?', { ...settings, provider: 'openai' })).rejects.toThrow();
  });
  it.each<Provider>(['anthropic', 'ollama'])('rejects incomplete %s output', async (provider) => {
    respond('Partial answer', provider, false, provider === 'anthropic' ? { stop_reason: 'max_tokens' } : { done: false });
    await expect(askQuestion(analysis, [], 'Why?', { ...settings, provider })).rejects.toThrow('未完成');
  });
});

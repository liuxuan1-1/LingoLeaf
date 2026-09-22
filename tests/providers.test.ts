import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeText, testProvider } from '../src/main/providers';
import { DEFAULT_SETTINGS } from '../src/main/store';
import type { Provider, Settings } from '../src/shared/types';

let server: Server;
let baseUrl: string;
let status = 200;
let payload: unknown;
let rawBody: string | undefined;
interface Reply {
  status?: number;
  payload?: unknown;
  raw?: string;
  contentType?: string;
  chunks?: Buffer[];
  keepOpen?: boolean;
}
let replies: Reply[] = [];
let captured: {
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, any>;
}[] = [];
const good = {
  corrected: 'She goes to school every day.',
  translation: '她每天都去上学。',
  professional: {
    text: 'She attends school every day.',
    explanation: 'attends school 是适合正式语境的自然表达。',
    improvements: ['用 attend 描述出席或上学，语气更正式。'],
  },
  isCorrect: true,
  explanation: '主谓一致正确。',
  issues: [],
  tags: ['主谓一致'],
  example: 'He walks to work.',
};
const incorrect = {
  ...good,
  isCorrect: false,
  issues: [
    {
      original: 'go',
      replacement: 'goes',
      explanation: '第三人称单数主语使用 goes。',
      rule: '主谓一致',
      kind: 'grammar',
    },
  ],
};
const envelope = (value: unknown) => ({
  choices: [{ message: { content: JSON.stringify(value) } }],
});
const responsesEnvelope = (value: unknown) => ({
  id: 'resp_test',
  object: 'response',
  status: 'completed',
  output: [
    {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
    },
  ],
});
const sseEvent = (type: string, fields: Record<string, unknown> = {}) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
const config = (provider: Provider = 'openai'): Settings => ({
  ...DEFAULT_SETTINGS,
  provider,
  endpoint: `${baseUrl}/v1`,
  apiKey: 'fake-secret-test-key',
  model: 'test-model',
});

beforeAll(async () => {
  server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    captured.push({ url: request.url || '', headers: request.headers, body: JSON.parse(body) });
    const reply = replies.shift();
    const replyStatus = reply?.status ?? status;
    response.writeHead(replyStatus, {
      'Content-Type': reply?.contentType ?? 'application/json',
      ...(replyStatus === 302 ? { Location: 'https://example.com/stolen' } : {}),
    });
    if (reply?.chunks) {
      response.flushHeaders();
      for (const chunk of reply.chunks) {
        if (response.destroyed) break;
        response.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (!reply.keepOpen) response.end();
    } else response.end(reply?.raw ?? rawBody ?? JSON.stringify(reply?.payload ?? payload));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
beforeEach(() => {
  status = 200;
  payload = envelope(incorrect);
  rawBody = undefined;
  replies = [];
  captured = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('provider HTTP adapters', () => {
  it('uses OpenAI chat completions and parses specific grammar issues', async () => {
    const result = await analyzeText('She go to school every day.', 'grammar', config());
    expect(result.isCorrect).toBe(false);
    expect(result.issues[0].rule).toBe('主谓一致');
    expect(result.translation).toBe('她每天都去上学。');
    expect(result.translationLanguage).toBe('简体中文');
    expect(captured[0].url).toBe('/v1/chat/completions');
    expect(captured[0].headers.authorization).toBe('Bearer fake-secret-test-key');
    expect(captured[0].body.response_format).toEqual({ type: 'json_object' });
    expect(captured[0].body.max_completion_tokens).toBe(8192);
    expect(captured[0].body.messages[0].content).toContain('optional stylistic');
    expect(JSON.parse(captured[0].body.messages[1].content)).toEqual({
      text: 'She go to school every day.',
    });
  });
  it('uses Anthropic system/messages, max_tokens, and required headers', async () => {
    payload = { content: [{ type: 'text', text: JSON.stringify(incorrect) }] };
    await analyzeText('She go to school every day.', 'grammar', config('anthropic'));
    expect(captured[0].url).toBe('/v1/messages');
    expect(captured[0].headers['x-api-key']).toBe('fake-secret-test-key');
    expect(captured[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(captured[0].body.max_tokens).toBe(8192);
    expect(captured[0].body.messages).toHaveLength(1);
    expect(captured[0].body.system).toContain('language teacher');
  });
  it('uses an Azure deployment URL and api-key instead of bearer auth', async () => {
    await analyzeText('She go to school every day.', 'grammar', {
      ...config('azure'),
      endpoint: baseUrl,
      model: 'my deployment',
      azureApiVersion: '2024-10-21',
    });
    expect(captured[0].url).toBe(
      '/openai/deployments/my%20deployment/chat/completions?api-version=2024-10-21',
    );
    expect(captured[0].headers['api-key']).toBe('fake-secret-test-key');
    expect(captured[0].body.max_completion_tokens).toBe(8192);
    expect(captured[0].headers.authorization).toBeUndefined();
  });
  it('uses native Ollama chat without requiring an API key', async () => {
    payload = { message: { role: 'assistant', content: JSON.stringify(good) }, done: true };
    await analyzeText(good.corrected, 'grammar', {
      ...config('ollama'),
      endpoint: baseUrl,
      apiKey: '',
    });
    expect(captured[0].url).toBe('/api/chat');
    expect(captured[0].body.format).toBe('json');
    expect(captured[0].body.options.num_predict).toBe(8192);
    expect(captured[0].body.stream).toBe(false);
    expect(captured[0].headers.authorization).toBeUndefined();
  });
  it('supports compatible endpoints without imposing unsupported response-format options', async () => {
    await analyzeText('She go to school every day.', 'grammar', {
      ...config('compatible'),
      endpoint: `${baseUrl}/custom/chat/completions`,
      apiKey: '',
    });
    expect(captured[0].url).toBe('/custom/chat/completions');
    expect(captured[0].body.response_format).toBeUndefined();
    expect(captured[0].body.max_completion_tokens).toBeUndefined();
    expect(captured[0].body.max_tokens).toBeUndefined();
    expect(captured[0].headers.authorization).toBeUndefined();
  });
  it('translates the selected question instead of answering and retains source identity', async () => {
    const { translation: _translation, professional: _professional, ...translationOutput } = good;
    payload = envelope({
      ...translationOutput,
      corrected: "What's the weather like today?",
      explanation: '询问天气使用 What is ... like。',
    });
    const result = await analyzeText('今天天气怎么样', 'translate', {
      ...config(),
      targetLanguage: 'English',
    });
    expect(result.original).toBe('今天天气怎么样');
    expect(result.corrected).toBe("What's the weather like today?");
    expect(result.mode).toBe('translate');
    expect(result).not.toHaveProperty('translation');
    expect(result).not.toHaveProperty('translationLanguage');
    expect(captured).toHaveLength(1);
    expect(captured[0].body.messages[0].content).not.toContain('"translation":');
    expect(captured[0].body.messages[0].content).toContain('do not answer it');
    expect(captured[0].body.messages[0].content).toContain('English');
  });
  it('preserves a grammatically correct input even when style is suggested', async () => {
    const text = 'I am very happy.';
    payload = envelope({
      ...good,
      corrected: 'I am delighted.',
      translation: '我很高兴。',
      issues: [
        {
          original: 'very happy',
          replacement: 'delighted',
          kind: 'style',
          rule: '可选词汇变化',
          explanation: '原句语法正确，这只是可选表达。',
        },
      ],
    });
    const result = await analyzeText(text, 'grammar', config());
    expect(result.corrected).toBe(text);
    expect(result.translation).toBe('我很高兴。');
  });
  it('translates the complete corrected text into the explanation language and preserves layout', async () => {
    const original = 'Daily plan:\r\n\r\n1. She go to school every day.\r\n   - She studies English.';
    const corrected = original.replace('She go', 'She goes');
    const translation = '毎日の予定：\r\n\r\n1. 彼女は毎日学校に行きます。\r\n   - 彼女は英語を勉強します。';
    payload = envelope({ ...incorrect, corrected, translation });
    const result = await analyzeText(original, 'grammar', {
      ...config(),
      explanationLanguage: '日本語',
      targetLanguage: 'Deutsch',
    });
    expect(result).toMatchObject({ original, corrected, translation, translationLanguage: '日本語' });
    expect(captured).toHaveLength(1);
    expect(captured[0].body.messages[0].content).toContain('entire corrected text into "日本語"');
    expect(captured[0].body.messages[0].content).toContain('paragraph breaks, blank lines, list markers');
    expect(captured[0].body.messages[0].content).not.toContain('Deutsch');
  });
  it('does not retain an unsolicited second translation in translation mode', async () => {
    const { professional: _professional, ...translationOutput } = good;
    payload = envelope(translationOutput);
    const result = await analyzeText('她每天都去上学。', 'translate', config());
    expect(result.corrected).toBe(good.corrected);
    expect(result).not.toHaveProperty('translation');
    expect(result).not.toHaveProperty('translationLanguage');
    expect(captured).toHaveLength(1);
  });
  it('runs an actual structured-content check when testing a connection', async () => {
    payload = envelope(good);
    expect(await testProvider(config())).toContain('连接成功');
    expect(captured).toHaveLength(1);
  });
});

describe('provider validation and safe errors', () => {
  it('keeps formal wording separate from correction and preserves the grammar verdict', async () => {
    payload = envelope({ ...good, corrected: good.professional.text });
    const result = await analyzeText(good.corrected, 'grammar', { ...config(), explanationLanguage: '日本語' });
    expect(result.corrected).toBe(good.corrected);
    expect(result.isCorrect).toBe(true);
    expect(result.professional).toEqual(good.professional);
    expect(captured).toHaveLength(1);
    const prompt = captured[0].body.messages[0].content;
    expect(prompt).toContain('Professional wording must never affect isCorrect');
    expect(prompt).toContain('Never invent promises, job titles');
    expect(prompt).toContain('Do not turn a possibility into a commitment');
    expect(prompt).toContain('"日本語"');
  });
  it.each([
    undefined, null, {}, 'formal sentence',
    { ...good.professional, text: ' \n\t' },
    { ...good.professional, text: 'x'.repeat(24001) },
    { ...good.professional, explanation: '' },
    { ...good.professional, explanation: 'x'.repeat(8001) },
    { ...good.professional, improvements: [] },
    { ...good.professional, improvements: [' '] },
    { ...good.professional, improvements: ['x'.repeat(2001)] },
    { ...good.professional, improvements: Array(9).fill('tip') },
    { ...good.professional, extra: 'unexpected field' },
  ])('rejects incomplete or oversized formal wording with no second model call %#', async (professional) => {
    payload = envelope({ ...good, professional });
    await expect(analyzeText(good.corrected, 'grammar', config())).rejects.toThrow('格式');
    expect(captured).toHaveLength(1);
  });
  it('accepts an already-professional sentence without forcing another rewrite', async () => {
    payload = envelope({ ...good, professional: { ...good.professional, text: good.corrected } });
    const result = await analyzeText(good.corrected, 'grammar', config());
    expect(result.professional?.text).toBe(result.corrected);
    expect(result.isCorrect).toBe(true);
  });
  it.each([undefined, '', ' \r\n\t', null, 42])(
    'rejects missing or blank grammar translations without making another model request %#',
    async (translation) => {
      payload = envelope({ ...good, translation });
      await expect(analyzeText(good.corrected, 'grammar', config())).rejects.toThrow(
        '未返回讲解语言的完整译文',
      );
      expect(captured).toHaveLength(1);
    },
  );
  it('rejects an oversized grammar translation without requesting a replacement', async () => {
    payload = envelope({ ...good, translation: '文'.repeat(24001) });
    await expect(analyzeText(good.corrected, 'grammar', config())).rejects.toThrow('格式');
    expect(captured).toHaveLength(1);
  });
  it('does not accept translation language metadata supplied by the model', async () => {
    payload = envelope({ ...good, translationLanguage: 'untrusted-model-language' });
    await expect(analyzeText(good.corrected, 'grammar', config())).rejects.toThrow('格式');
    expect(captured).toHaveLength(1);
  });
  it.each([
    {},
    { ...good, isCorrect: false },
    { ...incorrect, isCorrect: true },
    { ...good, surprise: 'extra field' },
    { ...incorrect, issues: [{ ...incorrect.issues[0], original: 'not in the input' }] },
  ])('rejects malformed or contradictory learning content %#', async (invalid) => {
    payload = envelope(invalid);
    await expect(analyzeText('She go to school every day.', 'grammar', config())).rejects.toThrow();
  });
  it('accepts only a surrounding JSON fence, not prose or embedded instructions', async () => {
    payload = {
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(good)}\n\`\`\`` } }],
    };
    await expect(analyzeText(good.corrected, 'grammar', config())).resolves.toMatchObject({
      isCorrect: true,
    });
    payload = { choices: [{ message: { content: `Here is my answer: ${JSON.stringify(good)}` } }] };
    await expect(analyzeText(good.corrected, 'grammar', config())).rejects.toThrow('格式');
  });
  it.each([401, 403, 404, 429, 500])(
    'does not expose server response bodies or keys on HTTP %i',
    async (code) => {
      status = code;
      payload = { error: 'fake-secret-test-key https://user:password@example.test' };
      let error: unknown;
      try {
        await analyzeText('Hello.', 'grammar', config());
      } catch (caught) {
        error = caught;
      }
      expect(String(error)).toContain(String(code));
      expect(String(error)).not.toContain('fake-secret');
      expect(String(error)).not.toContain('password');
    },
  );
  it('does not follow redirects with authentication', async () => {
    status = 302;
    await expect(analyzeText('Hello.', 'grammar', config())).rejects.toThrow('无法连接');
    expect(captured).toHaveLength(1);
  });
  it('rejects remote HTTP, embedded keys, and credential-bearing URLs before making a request', async () => {
    for (const endpoint of [
      'http://example.com/v1',
      'https://example.com/v1?api_key=secret',
      'https://user:secret@example.com/v1',
    ]) {
      await expect(analyzeText('Hello.', 'grammar', { ...config(), endpoint })).rejects.toThrow();
    }
    expect(captured).toHaveLength(0);
  });
  it('rejects empty/huge input and missing cloud credentials', async () => {
    await expect(analyzeText(' ', 'grammar', config())).rejects.toThrow();
    await expect(analyzeText('a'.repeat(12001), 'grammar', config())).rejects.toThrow();
    await expect(analyzeText('Hello.', 'grammar', { ...config(), apiKey: '' })).rejects.toThrow(
      'API Key',
    );
    expect(captured).toHaveLength(0);
  });
  it('rejects non-JSON protocol responses and oversized bodies', async () => {
    rawBody = '<html>Error proxy</html>';
    await expect(analyzeText('Hello.', 'grammar', config())).rejects.toThrow('JSON');
    rawBody = 'a'.repeat(1_048_600);
    await expect(analyzeText('Hello.', 'grammar', config())).rejects.toThrow('过大');
  });
  it('aborts a stalled request after 60 seconds with an actionable timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = analyzeText('Hello.', 'grammar', config());
    const expectation = expect(pending).rejects.toThrow('60 秒');
    await vi.advanceTimersByTimeAsync(60_000);
    await expectation;
  });
});

describe('Responses protocol routing', () => {
  it('sends official Responses instructions/input and accepts a completed JSON response', async () => {
    payload = responsesEnvelope(incorrect);
    const result = await analyzeText('She go to school every day.', 'grammar', {
      ...config(),
      requestProtocol: 'responses',
    });
    expect(result.corrected).toBe(incorrect.corrected);
    expect(result.translation).toBe(incorrect.translation);
    expect(result.translationLanguage).toBe('简体中文');
    const request = captured[0];
    expect(request.url).toBe('/v1/responses');
    expect(request.headers.authorization).toBe('Bearer fake-secret-test-key');
    expect(request.body.instructions).toContain('language teacher');
    expect(request.body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: JSON.stringify({ text: 'She go to school every day.' }) },
        ],
      },
    ]);
    expect(request.body).toMatchObject({
      stream: true,
      store: false,
      max_output_tokens: 8192,
      text: { format: { type: 'json_object' } },
    });
    expect(request.body.messages).toBeUndefined();
    expect(request.body.response_format).toBeUndefined();
    expect(request.body.max_completion_tokens).toBeUndefined();
  });
  it('preserves the Codex base path/model and omits optional fields for compatible Responses', async () => {
    payload = responsesEnvelope(good);
    await analyzeText(good.corrected, 'grammar', {
      ...config('compatible'),
      endpoint: `${baseUrl}/codex`,
      model: 'gpt-6-astra',
      requestProtocol: 'responses',
    });
    expect(captured[0].url).toBe('/codex/responses');
    expect(captured[0].body).toMatchObject({ model: 'gpt-6-astra', stream: true, store: false });
    expect(captured[0].body.max_output_tokens).toBeUndefined();
    expect(captured[0].body.text).toBeUndefined();
    expect(captured).toHaveLength(1);
  });
  it.each(['/codex/responses', '/codex/responses/', '/responses'])(
    'recognizes an explicit Responses endpoint in auto mode: %s',
    async (suffix) => {
      payload = responsesEnvelope(good);
      await analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: baseUrl + suffix,
      });
      expect(captured[0].url).toBe(suffix.replace(/\/$/, ''));
      expect(captured[0].body.input).toBeDefined();
      expect(captured).toHaveLength(1);
    },
  );
  it.each([404, 405])(
    'tries Responses only once after auto Chat Completions HTTP %i',
    async (code) => {
      replies = [
        { status: code, payload: { error: 'route unavailable' } },
        { payload: responsesEnvelope(good) },
      ];
      await analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: `${baseUrl}/codex?revision=abc`,
        requestProtocol: 'auto',
      });
      expect(captured.map((request) => request.url)).toEqual([
        '/codex/chat/completions?revision=abc',
        '/codex/responses?revision=abc',
      ]);
      expect(captured.map((request) => request.headers.authorization)).toEqual([
        'Bearer fake-secret-test-key',
        'Bearer fake-secret-test-key',
      ]);
      expect(captured[0].body.messages).toBeDefined();
      expect(captured[1].body.input).toBeDefined();
    },
  );
  it('does not switch protocols for an explicit Chat Completions choice', async () => {
    status = 404;
    await expect(
      analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: `${baseUrl}/codex/responses`,
        requestProtocol: 'chat-completions',
      }),
    ).rejects.toThrow('Chat Completions');
    expect(captured.map((request) => request.url)).toEqual(['/codex/chat/completions']);
  });
  it('limits automatic route failures to two attempts and gives a sanitized protocol/path error', async () => {
    status = 404;
    payload = { error: 'fake-secret-test-key remote error' };
    let failure = '';
    try {
      await analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: `${baseUrl}/fake-secret-test-key/codex?trace=do-not-show`,
      });
    } catch (error) {
      failure = String(error);
    }
    expect(captured).toHaveLength(2);
    expect(failure).toContain('Responses');
    expect(failure).toContain('/[已隐藏]/codex/responses');
    expect(failure).not.toContain('fake-secret-test-key');
    expect(failure).not.toContain('do-not-show');
    expect(failure).not.toContain('remote error');
  });
  it.each([400, 401, 403, 429, 500])('does not use protocol fallback for HTTP %i', async (code) => {
    status = code;
    await expect(
      analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: `${baseUrl}/codex`,
      }),
    ).rejects.toThrow(`HTTP ${code}`);
    expect(captured).toHaveLength(1);
  });
  it('does not retry a model call after malformed learning output', async () => {
    payload = envelope({ corrected: 'incomplete data', translation: '不完整的数据' });
    await expect(
      analyzeText(good.corrected, 'grammar', {
        ...config('compatible'),
        endpoint: `${baseUrl}/codex`,
      }),
    ).rejects.toThrow('格式');
    expect(captured).toHaveLength(1);
  });
  it('ignores Responses settings for native Anthropic, Ollama and Azure protocols', async () => {
    for (const provider of ['anthropic', 'ollama', 'azure'] as const) {
      payload =
        provider === 'anthropic'
          ? { content: [{ type: 'text', text: JSON.stringify(good) }] }
          : provider === 'ollama'
            ? { message: { content: JSON.stringify(good) } }
            : envelope(good);
      await analyzeText(good.corrected, 'grammar', {
        ...config(provider),
        endpoint: baseUrl,
        requestProtocol: 'responses',
      });
    }
    expect(captured.map((request) => request.url)).toEqual([
      '/v1/messages',
      '/api/chat',
      '/openai/deployments/test-model/chat/completions?api-version=2024-10-21',
    ]);
  });
});

describe('Responses JSON and SSE completion boundaries', () => {
  const responsesConfig = (): Settings => ({
    ...config('compatible'),
    endpoint: `${baseUrl}/codex`,
    requestProtocol: 'responses',
  });
  it('reads only assistant output_text and ignores reasoning/tool payloads', async () => {
    const response = responsesEnvelope(good);
    const text = JSON.stringify(good);
    payload = {
      ...response,
      output: [
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'not the answer' }] },
        { type: 'function_call', name: 'ignore_me', arguments: '{}' },
        {
          ...response.output[0],
          content: [
            { type: 'output_text', text: text.slice(0, 40) },
            { type: 'output_text', text: text.slice(40) },
          ],
        },
      ],
    };
    expect((await analyzeText(good.corrected, 'grammar', responsesConfig())).isCorrect).toBe(true);
  });
  it.each(['incomplete', 'failed', 'cancelled', 'in_progress'])(
    'rejects a JSON response with status %s even if it contains valid partial output',
    async (responseStatus) => {
      payload = { ...responsesEnvelope(good), status: responseStatus };
      await expect(analyzeText(good.corrected, 'grammar', responsesConfig())).rejects.toThrow(
        '未完成',
      );
      expect(captured).toHaveLength(1);
    },
  );
  it('rejects refusal content rather than treating it as a correction', async () => {
    const response = responsesEnvelope(good);
    payload = {
      ...response,
      output: [
        { ...response.output[0], content: [{ type: 'refusal', refusal: 'private refusal text' }] },
      ],
    };
    await expect(analyzeText(good.corrected, 'grammar', responsesConfig())).rejects.toThrow('拒绝');
  });
  it('handles CRLF/multiline events, split UTF-8, repeated delta/done text and completion without waiting for EOF', async () => {
    const completed = JSON.stringify(
      { type: 'response.completed', response: responsesEnvelope(good) },
      null,
      2,
    );
    const event =
      ': keepalive\r\n\r\n' +
      sseEvent('response.created', { response: { status: 'in_progress' } }) +
      sseEvent('response.output_text.delta', {
        delta: JSON.stringify(good),
        output_index: 0,
        content_index: 0,
      }) +
      sseEvent('response.output_text.done', {
        text: JSON.stringify(good),
        output_index: 0,
        content_index: 0,
      }) +
      'event: response.completed\r\n' +
      completed
        .split('\n')
        .map((line) => 'data: ' + line)
        .join('\r\n') +
      '\r\n\r\n';
    const encoded = Buffer.from(event);
    const chinese = encoded.indexOf(Buffer.from('主谓一致'));
    const cr = encoded.indexOf(Buffer.from('\r\n'));
    replies = [
      {
        contentType: 'text/event-stream; charset=utf-8',
        chunks: [
          encoded.subarray(0, cr + 1),
          encoded.subarray(cr + 1, chinese + 1),
          encoded.subarray(chinese + 1, chinese + 2),
          encoded.subarray(chinese + 2),
        ],
        keepOpen: true,
      },
    ];
    const result = await analyzeText(good.corrected, 'grammar', responsesConfig());
    expect(result.explanation).toBe(good.explanation);
    expect(result.isCorrect).toBe(true);
    expect(captured).toHaveLength(1);
  });
  it('accepts a final completed event at EOF without a trailing blank line', async () => {
    replies = [
      {
        contentType: 'text/event-stream',
        raw: sseEvent('response.completed', { response: responsesEnvelope(good) }).trimEnd(),
      },
    ];
    await expect(analyzeText(good.corrected, 'grammar', responsesConfig())).resolves.toMatchObject({
      isCorrect: true,
    });
  });
  it.each(['error', 'response.failed', 'response.incomplete'])(
    'rejects terminal SSE %s without repeating the model call',
    async (type) => {
      replies = [
        {
          contentType: 'text/event-stream',
          raw:
            sseEvent('response.output_text.delta', { delta: JSON.stringify(good) }) +
            sseEvent(type, { error: { message: 'fake-secret-test-key' } }),
        },
      ];
      let failure = '';
      try {
        await analyzeText(good.corrected, 'grammar', responsesConfig());
      } catch (error) {
        failure = String(error);
      }
      expect(failure).toContain('未完成');
      expect(failure).not.toContain('fake-secret-test-key');
      expect(captured).toHaveLength(1);
    },
  );
  it.each(['', 'data: [DONE]\n\n'])(
    'rejects a stream ending without response.completed (%j)',
    async (suffix) => {
      replies = [
        {
          contentType: 'text/event-stream',
          raw: sseEvent('response.output_text.delta', { delta: JSON.stringify(good) }) + suffix,
        },
      ];
      await expect(analyzeText(good.corrected, 'grammar', responsesConfig())).rejects.toThrow(
        '完成结果',
      );
    },
  );
  it('rejects malformed UTF-8, malformed events and oversized streams', async () => {
    const cases: Reply[] = [
      {
        contentType: 'text/event-stream',
        chunks: [Buffer.from('data: "'), Buffer.from([0xff]), Buffer.from('"\n\n')],
      },
      { contentType: 'text/event-stream', raw: 'data: not-json\n\n' },
      { contentType: 'text/event-stream', chunks: [Buffer.alloc(1_048_600, 'x')] },
    ];
    for (const reply of cases) {
      replies = [reply];
      await expect(analyzeText(good.corrected, 'grammar', responsesConfig())).rejects.toThrow();
    }
    expect(captured).toHaveLength(3);
  });
});

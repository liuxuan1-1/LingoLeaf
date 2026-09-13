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
let captured: {
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, any>;
}[] = [];
const good = {
  corrected: 'She goes to school every day.',
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
    response.writeHead(status, {
      'Content-Type': 'application/json',
      ...(status === 302 ? { Location: 'https://example.com/stolen' } : {}),
    });
    response.end(rawBody ?? JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
beforeEach(() => {
  status = 200;
  payload = envelope(incorrect);
  rawBody = undefined;
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
    expect(captured[0].url).toBe('/v1/chat/completions');
    expect(captured[0].headers.authorization).toBe('Bearer fake-secret-test-key');
    expect(captured[0].body.response_format).toEqual({ type: 'json_object' });
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
    expect(captured[0].body.max_tokens).toBeGreaterThan(0);
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
    expect(captured[0].headers.authorization).toBeUndefined();
  });
  it('translates the selected question instead of answering and retains source identity', async () => {
    payload = envelope({
      ...good,
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
    expect(captured[0].body.messages[0].content).toContain('do not answer it');
    expect(captured[0].body.messages[0].content).toContain('English');
  });
  it('preserves a grammatically correct input even when style is suggested', async () => {
    const text = 'I am very happy.';
    payload = envelope({
      ...good,
      corrected: 'I am delighted.',
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
    expect((await analyzeText(text, 'grammar', config())).corrected).toBe(text);
  });
  it('runs an actual structured-content check when testing a connection', async () => {
    payload = envelope(good);
    expect(await testProvider(config())).toContain('连接成功');
    expect(captured).toHaveLength(1);
  });
});

describe('provider validation and safe errors', () => {
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

// A deterministic local protocol fixture, not a language model. Never used by production automatically.
import { createServer } from 'node:http';
const port = Number(process.argv[2] || 47841);
const server = createServer(async (req, res) => {
  if (req.url != '/v1/chat/completions' || req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) {
        res.writeHead(413).end();
        return;
      }
    }
    const body = JSON.parse(raw);
    const text = JSON.parse(body.messages.at(-1).content).text;
    const translating = body.messages[0].content.includes('Translate the selected text');
    const incorrect = !translating && /\bShe go\b/.test(text);
    const output = {
      corrected: translating
        ? 'How is the weather today?'
        : incorrect
          ? text.replace(/\bShe go\b/, 'She goes')
          : text,
      ...(!translating ? {
        translation: '她去上学。此译文来自本地测试服务。',
        professional: {
          text: text.replace(/\bShe go(?:es)? to school\b/, 'She attends school'),
          explanation: '用自然、简洁的正式表达。此结果来自本地测试服务。',
          improvements: ['attend school 是描述上学的正式表达。'],
        },
      } : {}),
      isCorrect: !incorrect,
      explanation: translating
        ? '“How is the weather” 用来询问天气。此结果来自本地测试服务。'
        : incorrect
          ? '一般现在时中，第三人称单数主语 She 后的动词应使用 goes。此结果来自本地测试服务。'
          : '这句话语法正确。此结果来自本地测试服务。',
      issues: incorrect
        ? [
            {
              original: 'go',
              replacement: 'goes',
              explanation: '主语 She 是第三人称单数，go 要变为 goes。',
              rule: '主谓一致',
              kind: 'grammar',
            },
          ]
        : [],
      tags: translating ? ['天气', '日常交流'] : ['主谓一致'],
      example: translating
        ? 'What is the weather like tomorrow?'
        : 'He works from home every Friday.',
    };
    if (text.includes('DELAY')) await new Promise((resolve) => setTimeout(resolve, 10000));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(output) } }],
      }),
    );
  } catch {
    res.writeHead(400).end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log('LOCAL TEST FIXTURE: http://127.0.0.1:' + port + '/v1 — synthetic responses only'),
);

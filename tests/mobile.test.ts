import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { promises as fs } from 'node:fs';
import os, { networkInterfaces } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import QRCode from 'qrcode';
import { MobileServer } from '../src/main/mobile';
import { MOBILE_HTML, renderMobilePage } from '../src/main/mobile-page';
import { LibraryStore } from '../src/main/store';
import type { Entry, Rating, UiLanguage } from '../src/shared/types';
import * as i18n from '../src/shared/i18n';
import { initialReview, scheduleReview } from '../src/shared/scheduler';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, networkInterfaces: vi.fn(actual.networkInterfaces) };
});

const entry: Entry = {
  id: '8786bc64-e37f-4c47-9bc1-1b0847586521',
  mode: 'grammar',
  original: 'She go to school.',
  corrected: 'She goes to school.',
  isCorrect: false,
  explanation: '第三人称单数用 goes。',
  issues: [
    {
      original: 'go',
      replacement: 'goes',
      explanation: '主语是第三人称单数。',
      rule: '主谓一致',
      kind: 'grammar',
    },
  ],
  tags: ['主谓一致'],
  example: 'He works here.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  review: initialReview(),
  sourceLanguage: 'English',
  targetLanguage: 'English',
};
const servers: MobileServer[] = [];
const directories: string[] = [];
async function fixture() {
  let items = [structuredClone(entry)];
  let changes = 0;
  const server = new MobileServer(
    {
      list: () => structuredClone(items),
      rate: async (id: string, rating: Rating) => {
        if (id !== entry.id) throw Error('missing');
        items = [{ ...items[0], review: scheduleReview(items[0].review, rating) }];
        return items[0];
      },
    },
    () => {
      changes++;
    },
  );
  servers.push(server);
  const status = await server.start('127.0.0.1');
  const url = new URL(status.urls[0]);
  const token = url.hash.slice(1);
  url.hash = '';
  return { server, url: url.origin, token, changes: () => changes };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});
describe('paired mobile learning', () => {
  it('serves a responsive companion without exposing learning data or token in its page', async () => {
    const f = await fixture();
    const r = await fetch(f.url);
    const page = await r.text();
    expect(r.status).toBe(200);
    expect(page).toContain('viewport');
    expect(page).not.toContain(f.token);
    expect(page).not.toContain(entry.original);
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it('requires pairing before reading and rejects a forged token', async () => {
    const f = await fixture();
    for (const auth of ['', 'Bearer bad']) {
      const r = await fetch(f.url + '/api/entries', { headers: { authorization: auth } });
      expect(r.status).toBe(401);
    }
    const r = await fetch(f.url + '/api/entries', {
      headers: { authorization: 'Bearer ' + f.token },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).entries[0].original).toBe(entry.original);
  });
  it('writes phone review to the same desktop authority and broadcasts a change', async () => {
    const f = await fixture();
    const r = await fetch(f.url + '/api/review', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/json' },
      body: JSON.stringify({ id: entry.id, rating: 'good' }),
    });
    expect(r.status).toBe(200);
    const reviewed = (await r.json()).entry;
    expect(Date.parse(reviewed.review.dueAt)).toBeGreaterThan(Date.now());
    expect(f.changes()).toBe(1);
    const state = await (
      await fetch(f.url + '/api/entries', { headers: { authorization: 'Bearer ' + f.token } })
    ).json();
    expect(state.entries[0].review).toEqual(reviewed.review);
  });
  it('rejects cross-origin writes and invalid ratings without changing progress', async () => {
    const f = await fixture();
    for (const [origin, rating, code] of [
      [f.url, 'unknown', 400],
      ['http://untrusted.invalid', 'good', 403],
    ]) {
      const r = await fetch(f.url + '/api/review', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + f.token,
          'content-type': 'application/json',
          origin: String(origin),
        },
        body: JSON.stringify({ id: entry.id, rating }),
      });
      expect(r.status).toBe(code);
    }
    expect(f.changes()).toBe(0);
  });
  it('rotates pairing token after stop and restarts', async () => {
    const f = await fixture();
    await f.server.stop();
    expect(f.server.status().running).toBe(false);
    const next = await f.server.start('127.0.0.1');
    const url = new URL(next.urls[0]);
    expect(url.hash.slice(1)).not.toBe(f.token);
    url.hash = '';
    expect(
      (
        await fetch(url.origin + '/api/entries', {
          headers: { authorization: 'Bearer ' + f.token },
        })
      ).status,
    ).toBe(401);
  });
});

async function sendChunks(url: string, token: string, chunks: Buffer[]) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const request = httpRequest(
      url + '/api/review',
      {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      },
      (response) => {
        const received: Buffer[] = [];
        response.on('data', (chunk) => received.push(Buffer.from(chunk)));
        response.on('end', () =>
          resolve({
            status: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(received).toString('utf8')),
          }),
        );
      },
    );
    request.on('error', reject);
    request.flushHeaders();
    void (async () => {
      for (const chunk of chunks) {
        if (request.destroyed) return;
        request.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      request.end();
    })();
  });
}

describe('mobile lifecycle and request boundaries', () => {
  it('shares a completed start across simultaneous callers and serializes stop during startup', async () => {
    const server = new MobileServer({
      list: () => [],
      rate: async () => {
        throw new Error('unused');
      },
    });
    servers.push(server);
    const starts = [server.start('127.0.0.1'), server.start('127.0.0.1')];
    const stopped = server.stop();
    const [first, second] = await Promise.all(starts);
    expect(first.running).toBe(true);
    expect(second.urls).toEqual(first.urls);
    expect(await stopped).toEqual({ running: false, urls: [] });
    expect(server.status().running).toBe(false);
    const fresh = await server.start('127.0.0.1');
    expect(new URL(fresh.urls[0]).hash).not.toBe(new URL(first.urls[0]).hash);
  });
  it('recovers from QR startup failure without leaving a running server or poisoning later starts', async () => {
    const server = new MobileServer({
      list: () => [],
      rate: async () => {
        throw new Error('unused');
      },
    });
    servers.push(server);
    vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('QR generation failed'));
    await expect(server.start('127.0.0.1')).rejects.toThrow('QR generation failed');
    expect(server.status()).toEqual({ running: false, urls: [] });
    expect((await server.start('127.0.0.1')).running).toBe(true);
  });
  it('returns a detached status so callers cannot change active pairing URLs', async () => {
    const f = await fixture();
    const status = f.server.status();
    status.urls.length = 0;
    expect(f.server.status().urls).toHaveLength(1);
  });
  it('prefers private LAN addresses over VPN/public interfaces in the pairing QR', async () => {
    const nic = (address: string): os.NetworkInterfaceInfo => ({
      address,
      family: 'IPv4',
      internal: false,
      netmask: '255.255.255.0',
      mac: '00:00:00:00:00:00',
      cidr: address + '/24',
    });
    vi.mocked(networkInterfaces).mockReturnValueOnce({
      vpn: [nic('100.64.0.1')],
      other: [nic('10.1.2.3')],
      wifi: [nic('192.168.50.4')],
      unavailable: [nic('169.254.1.1')],
    });
    const server = new MobileServer({
      list: () => [],
      rate: async () => {
        throw new Error('unused');
      },
    });
    servers.push(server);
    const status = await server.start();
    expect(status.urls.map((value) => new URL(value).hostname)).toEqual([
      '192.168.50.4',
      '10.1.2.3',
      '100.64.0.1',
    ]);
  });
  it('rejects invalid body types and oversized fixed/chunked bodies with explicit HTTP status', async () => {
    const f = await fixture();
    for (const rating of [['good'], {}, null, 1]) {
      const response = await fetch(f.url + '/api/review', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id, rating }),
      });
      expect(response.status).toBe(400);
    }
    const wrongType = await fetch(f.url + '/api/review', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/jsonp' },
      body: '{}',
    });
    expect(wrongType.status).toBe(415);
    const oversized = await fetch(f.url + '/api/review', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/json' },
      body: 'x'.repeat(4097),
    });
    expect(oversized.status).toBe(413);
    expect(
      (
        await sendChunks(f.url, f.token, [
          Buffer.alloc(2048, 'x'),
          Buffer.alloc(2048, 'x'),
          Buffer.alloc(1, 'x'),
        ])
      ).status,
    ).toBe(413);
    expect(f.changes()).toBe(0);
  });
  it('decodes split UTF-8 only after all bytes arrive and rejects malformed UTF-8', async () => {
    const server = new MobileServer({
      list: () => [{ ...entry, id: '汉' }],
      rate: async (id) => ({ ...entry, id }),
    });
    servers.push(server);
    const status = await server.start('127.0.0.1'),
      url = new URL(status.urls[0]);
    const token = url.hash.slice(1);
    const bytes = Buffer.from('汉');
    const response = await sendChunks(url.origin, token, [
      Buffer.from('{"id":"'),
      bytes.subarray(0, 1),
      bytes.subarray(1),
      Buffer.from('","rating":"good"}'),
    ]);
    expect(response.status).toBe(200);
    expect(response.body.entry.id).toBe('汉');
    const invalid = await sendChunks(url.origin, token, [
      Buffer.from('{"id":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('","rating":"good"}'),
    ]);
    expect(invalid.status).toBe(400);
  });
  it('distinguishes a storage failure from a missing card without exposing local error details', async () => {
    const server = new MobileServer({
      list: () => [entry],
      rate: async () => {
        throw new Error('C:\\private\\library.json is unavailable');
      },
    });
    servers.push(server);
    const status = await server.start('127.0.0.1'),
      url = new URL(status.urls[0]);
    const headers = {
      authorization: 'Bearer ' + url.hash.slice(1),
      'content-type': 'application/json',
    };
    const missing = await fetch(url.origin + '/api/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'missing', rating: 'good' }),
    });
    expect(missing.status).toBe(404);
    const failed = await fetch(url.origin + '/api/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: entry.id, rating: 'good' }),
    });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('private');
  });
  it('does not misreport a committed review when desktop notification fails', async () => {
    const server = new MobileServer({ list: () => [entry], rate: async () => entry }, () => {
      throw new Error('window is closed');
    });
    servers.push(server);
    const status = await server.start('127.0.0.1'),
      url = new URL(status.urls[0]);
    const response = await fetch(url.origin + '/api/review', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + url.hash.slice(1), 'content-type': 'application/json' },
      body: JSON.stringify({ id: entry.id, rating: 'good' }),
    });
    expect(response.status).toBe(200);
  });
  it('persists a phone review through the actual LibraryStore and keeps provider credentials private', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingoleaf-mobile-'));
    directories.push(directory);
    const protect = (value: string) => Buffer.from(value).toString('base64');
    const unprotect = (value: string) => Buffer.from(value, 'base64').toString('utf8');
    const store = new LibraryStore(directory, protect, unprotect);
    await store.init();
    await store.saveSettings({ ...store.getSettings(), apiKey: 'secret-not-for-phone' });
    const {
      id: _id,
      createdAt: _created,
      updatedAt: _updated,
      review: _review,
      sourceLanguage: _source,
      targetLanguage: _target,
      ...analysis
    } = entry;
    const translation = '她去学校。\n\n  每天如此。';
    const added = await store.add(
      { ...analysis, translation, translationLanguage: '简体中文' },
      store.getSettings(),
    );
    const server = new MobileServer(store);
    servers.push(server);
    const status = await server.start('127.0.0.1'),
      url = new URL(status.urls[0]);
    const headers = {
      authorization: 'Bearer ' + url.hash.slice(1),
      'content-type': 'application/json',
    };
    const state = await fetch(url.origin + '/api/entries', { headers });
    const text = await state.text();
    expect(text).not.toContain('secret-not-for-phone');
    expect(text).not.toContain('apiKey');
    expect(JSON.parse(text).entries[0]).toMatchObject({ translation, translationLanguage: '简体中文' });
    const response = await fetch(url.origin + '/api/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: added.id, rating: 'good' }),
    });
    expect(response.status).toBe(200);
    const reviewed = (await response.json()).entry;
    expect(reviewed.review.repetitions).toBe(1);
    expect(reviewed).toMatchObject({ translation, translationLanguage: '简体中文' });
    const restarted = new LibraryStore(directory, protect, unprotect);
    await restarted.init();
    expect(restarted.list()[0].review).toEqual(reviewed.review);
    expect(restarted.list()[0]).toMatchObject({ translation, translationLanguage: '简体中文' });
    expect(await fs.readFile(path.join(store.getLibraryDirectory(), 'index.md'), 'utf8')).toContain(
      reviewed.review.dueAt.slice(0, 16).replace('T', ' '),
    );
  });
  it('ships a syntactically valid client script (the HTML string is not compiled by TypeScript)', () => {
    const script = MOBILE_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Script(script!)).not.toThrow();
  });
  it('reveals and searches grammar translations as literal text, without inventing old translations', async () => {
    const translated = {
      ...entry,
      translation: '她去学校。\n\n  - <img src=x onerror=alert(1)>\n\t保留缩进 & 空行',
      translationLanguage: '<简体中文>',
    };
    const script = new Script(MOBILE_HTML.match(/<script>([\s\S]*?)<\/script>/)![1]);
    const elements = new Map<string, any>();
    const getElementById = (id: string) => {
      if (!elements.has(id)) elements.set(id, {
        innerHTML: '', textContent: '', value: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
      });
      return elements.get(id);
    };
    const page = {
      document: { getElementById, querySelectorAll: () => [], addEventListener() {}, hidden: false },
      location: { hash: '#test-only-token', pathname: '/' },
      history: { replaceState() {} },
      sessionStorage: { getItem: () => null, setItem() {} },
      fetch: async () => ({ ok: true, json: async () => ({ entries: [translated], now: new Date().toISOString() }) }),
      AbortController, setTimeout, clearTimeout, setInterval: () => 0,
    };
    await script.runInNewContext(page);
    expect(getElementById('review').innerHTML).not.toContain('保留缩进');
    getElementById('reveal').onclick();
    const revealed = getElementById('review').innerHTML;
    expect(revealed).toContain('句意 · &lt;简体中文&gt;');
    expect(revealed).toContain('她去学校。\n\n  - &lt;img src=x onerror=alert(1)&gt;\n\t保留缩进 &amp; 空行');
    expect(revealed).not.toContain('<img');
    getElementById('search').value = '保留缩进';
    getElementById('search').oninput();
    expect(getElementById('items').innerHTML).toContain(entry.original);

    for (const oldOrTranslation of [entry, { ...translated, mode: 'translate' }]) {
      elements.clear();
      await script.runInNewContext({
        ...page,
        fetch: async () => ({ ok: true, json: async () => ({ entries: [oldOrTranslation], now: new Date().toISOString() }) }),
      });
      getElementById('reveal').onclick();
      expect(getElementById('review').innerHTML).not.toContain('class="meaning"');
    }
  });
  it.each(['read', 'express'] as const)('renders %s learning fields and saved tutoring as escaped, searchable text', async (mode) => {
    const hostile = '<img src=x onerror=alert(1)> & "';
    const learning: Entry = {
      ...entry,
      mode,
      original: mode === 'read' ? 'Although it rained, we went for a walk.' : '想礼貌地表达忙不过来。',
      corrected: 'A sentence.\n\n  Indented sentence.',
      targetLanguage: mode === 'read' ? '<简体中文>' : 'English',
      grammarPoints: [{ text: `语法片段 ${hostile}`, explanation: `语法解释 ${hostile}` }],
      keyPoints: [`要点词 ${hostile}`],
      alternatives: [{ text: `备选句子 ${hostile}`, tone: `语气词 ${hostile}`, explanation: `备选解释 ${hostile}` }],
      clarificationQuestions: [`澄清词 ${hostile}`],
      expressionContext: `场景词 ${hostile}`,
      expressionTone: `自选语气 ${hostile}`,
      conversation: [{ id: 'd25a5eae-1fd8-4fb7-a4d7-6e9f91a2b17d', question: `追问词 ${hostile}`, answer: `回答词 ${hostile}\n\n  多行答案`, createdAt: `时间 ${hostile}` }],
    };
    const script = new Script(MOBILE_HTML.match(/<script>([\s\S]*?)<\/script>/)![1]);
    const elements = new Map<string, any>();
    const getElementById = (id: string) => {
      if (!elements.has(id)) elements.set(id, {
        innerHTML: '', textContent: '', value: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
      });
      return elements.get(id);
    };
    const requests: string[] = [];
    await script.runInNewContext({
      document: { getElementById, querySelectorAll: () => [], addEventListener() {}, hidden: false },
      location: { hash: '#test-only-token', pathname: '/' },
      history: { replaceState() {} },
      sessionStorage: { getItem: () => null, setItem() {} },
      fetch: async (url: string) => {
        requests.push(url);
        return { ok: true, json: async () => ({ entries: [learning], now: new Date().toISOString() }) };
      },
      AbortController, setTimeout, clearTimeout, setInterval: () => 0,
    });
    expect(getElementById('review').innerHTML).toContain(mode === 'read' ? '理解句意和结构' : '试着表达你的意思');
    expect(getElementById('review').innerHTML).not.toContain('要点词');
    getElementById('reveal').onclick();
    const revealed = getElementById('review').innerHTML;
    for (const section of ['语法结构', '要点摘要', '其他表达', '可以再想一想', '表达场景', '表达语气', '追问与回答']) expect(revealed).toContain(section);
    for (const field of ['语法片段', '语法解释', '要点词', '备选句子', '语气词', '备选解释', '澄清词', '场景词', '自选语气', '追问词', '回答词', '时间']) {
      expect(revealed).toContain(`${field} &lt;img src=x onerror=alert(1)&gt; &amp; &quot;`);
    }
    expect(revealed).toContain('A sentence.\n\n  Indented sentence.');
    expect(revealed).toContain('\n\n  多行答案');
    expect(revealed).not.toContain('<img');
    if (mode === 'read') expect(revealed).toContain('译文 · &lt;简体中文&gt;');
    for (const query of ['语法解释', '要点词', '备选解释', '澄清词', '场景词', '自选语气', '追问词', '回答词']) {
      getElementById('search').value = query;
      getElementById('search').oninput();
      expect(getElementById('items').innerHTML).toContain(learning.original);
    }
    getElementById('search').value = 'absent-search-term';
    getElementById('search').oninput();
    expect(getElementById('items').innerHTML).toContain('没有找到句子');
    expect(requests).toEqual(['/api/entries']);
  });
  it('returns saved reading fields and tutoring through the paired API without adding a model-call endpoint', async () => {
    const learning: Entry = {
      ...entry, mode: 'read', corrected: '她去学校。', targetLanguage: '简体中文',
      grammarPoints: [{ text: 'She', explanation: '主语' }], keyPoints: ['一般现在时'],
      conversation: [{ id: 'd25a5eae-1fd8-4fb7-a4d7-6e9f91a2b17d', question: '为什么用 goes？', answer: '主语为第三人称单数。', createdAt: new Date().toISOString() }],
    };
    const server = new MobileServer({ list: () => [learning], rate: async () => learning });
    servers.push(server);
    const status = await server.start('127.0.0.1');
    const url = new URL(status.urls[0]);
    const headers = { authorization: 'Bearer ' + url.hash.slice(1) };
    const response = await fetch(url.origin + '/api/entries', { headers });
    expect((await response.json()).entries).toEqual([learning]);
    const unsupported = await fetch(url.origin + '/api/ask', { method: 'POST', headers });
    expect(unsupported.status).toBe(404);
  });
});

async function renderPhone(language: UiLanguage, items: Entry[]) {
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', value: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
    });
    return elements.get(id);
  };
  const page = renderMobilePage(language);
  const script = new Script(page.match(/<script>([\s\S]*?)<\/script>/)![1]);
  const requests: string[] = [];
  await script.runInNewContext({
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    location: { hash: '#test-only-token', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async (url: string) => { requests.push(url); return { ok: true, json: async () => ({ entries: items, now: new Date().toISOString() }) }; },
    AbortController, setTimeout, clearTimeout, setInterval: () => 0,
  });
  return { page, element, requests };
}

describe('localized mobile UI and professional writing', () => {
  it('renders and searches professional wording as literal text without rewriting saved learning content', async () => {
    const formal: Entry = { ...entry, professional: {
      text: 'She attends school.\n\n  <img src=x onerror=alert(1)>',
      explanation: '正式说明 & <tag>', improvements: ['提升要点 <script>'],
    } };
    const phone = await renderPhone('en', [formal]);
    expect(phone.page).toContain('<html lang="en">');
    expect(phone.page).toContain('Search sentences and grammar rules…');
    expect(phone.page).not.toContain('正在连接');
    expect(phone.element('summary').textContent).toBe('1 saved sentences · 1 due for review');
    expect(phone.element('status').textContent).toBe('● Connected to desktop');
    expect(phone.element('review').innerHTML).not.toContain('She attends');
    phone.element('reveal').onclick();
    const result = phone.element('review').innerHTML;
    expect(result).toContain('Professional / formal wording');
    expect(result).toContain('Writing improvements');
    expect(result).toContain('She attends school.\n\n  &lt;img src=x onerror=alert(1)&gt;');
    expect(result).toContain('正式说明 &amp; &lt;tag&gt;');
    expect(result).toContain('提升要点 &lt;script&gt;');
    expect(result).toContain(entry.corrected);
    expect(result).not.toContain('<img');
    for (const query of ['attends', '正式说明', '提升要点']) {
      phone.element('search').value = query;
      phone.element('search').oninput();
      expect(phone.element('items').innerHTML).toContain(entry.original);
    }
    phone.element('search').value = 'absent-search-term';
    phone.element('search').oninput();
    expect(phone.element('items').innerHTML).toContain('No sentences found.');
    expect(phone.requests).toEqual(['/api/entries']);
  });
  it('does not invent a professional section for legacy entries', async () => {
    const phone = await renderPhone('en', [entry]);
    phone.element('reveal').onclick();
    expect(phone.element('review').innerHTML).not.toContain('Professional / formal wording');
  });
  it.each(['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es'] as const)('ships a valid %s page and client with the correct document language', (language) => {
    const page = renderMobilePage(language);
    expect(page).toContain(`<html lang="${language}">`);
    expect(() => new Script(page.match(/<script>([\s\S]*?)<\/script>/)![1])).not.toThrow();
  });
  it('escapes translated chrome before embedding it in HTML and JavaScript', async () => {
    const hostile = '</script><img src=x onerror=alert(1)> & "\u2028\u2029';
    vi.spyOn(i18n, 'createTranslator').mockReturnValue(() => hostile);
    const phone = await renderPhone('en', [entry]);
    expect(phone.page.match(/<\/script>/g)).toHaveLength(1);
    expect(phone.page).not.toContain('<img');
    expect(phone.page).toContain('\\u003c/script\\u003e');
    expect(phone.page).toContain('\\u2028');
    phone.element('reveal').onclick();
    expect(phone.element('review').innerHTML).toContain('&lt;/script&gt;');
    expect(phone.element('review').innerHTML).not.toContain('<img');
  });
  it('serves the current desktop language and localized pairing errors without exposing settings', async () => {
    let language: UiLanguage = 'en';
    const server = new MobileServer({ getUiLanguage: () => language, list: () => [entry], rate: async () => entry });
    servers.push(server);
    const status = await server.start('127.0.0.1');
    const url = new URL(status.urls[0]);
    const english = await (await fetch(url.origin)).text();
    expect(english).toContain('Make progress today.');
    expect(english).not.toContain(entry.original);
    const denied = await fetch(url.origin + '/api/entries');
    expect(denied.status).toBe(401);
    expect((await denied.json()).error).toBe('This connection has expired. Scan the desktop QR code again.');
    language = 'zh-CN';
    const chinese = await (await fetch(url.origin)).text();
    expect(chinese).toContain('让进步，发生在今天。');
    expect(chinese).not.toContain('apiKey');
    expect(chinese).not.toContain(url.hash.slice(1));
  });
});

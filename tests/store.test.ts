import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore, renderEntryMarkdown } from '../src/main/store';
import type { Analysis } from '../src/shared/types';

let directory: string;
const protect = (value: string) => `protected:${Buffer.from(value).toString('base64')}`;
const unprotect = (value: string) => {
  if (!value.startsWith('protected:')) throw new Error('bad ciphertext');
  return Buffer.from(value.slice(10), 'base64').toString('utf8');
};
const makeStore = () => new LibraryStore(directory, protect, unprotect);
const analysis: Analysis = {
  mode: 'grammar',
  original: 'She go to school.',
  corrected: 'She goes to school.',
  isCorrect: false,
  explanation: '主语为第三人称单数。',
  issues: [
    {
      original: 'go',
      replacement: 'goes',
      kind: 'grammar',
      rule: '主谓一致',
      explanation: '使用 goes。',
    },
  ],
  tags: ['主谓一致'],
  example: 'He walks to work.',
};

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingoleaf-store-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('learning storage', () => {
  it('persists analyses, encrypted credentials, and redacted public settings across a restart', async () => {
    const first = makeStore();
    await first.init();
    await first.saveSettings({ ...first.getSettings(), apiKey: 'sensitive-api-key' });
    const entry = await first.add(analysis, first.getSettings());
    expect(first.getSettings()).toMatchObject({ apiKey: '', hasApiKey: true });
    expect(first.getProviderSettings().apiKey).toBe('sensitive-api-key');
    expect(await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).not.toContain(
      'sensitive-api-key',
    );
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.getProviderSettings().apiKey).toBe('sensitive-api-key');
    expect(restarted.list()[0]).toEqual(entry);
    const files = await fs.readdir(path.join(restarted.getLibraryDirectory(), 'entries'));
    expect(files).toHaveLength(1);
    const note = await fs.readFile(
      path.join(restarted.getLibraryDirectory(), 'entries', files[0]),
      'utf8',
    );
    expect(note).toContain('She go to school.');
    expect(note).toContain('She goes to school.');
    expect(note).toContain('主谓一致');
    expect(note).toContain('主动练习');
    expect(restarted.getSyncError()).toBeNull();
  });
  it('retains an empty submitted key only for the same provider/endpoint and supports explicit clearing', async () => {
    const store = makeStore();
    await store.init();
    const original = store.getSettings();
    await store.saveSettings({ ...original, apiKey: 'secret-a' });
    await store.saveSettings({ ...store.getSettings(), model: 'another-model', apiKey: '' });
    expect(store.getProviderSettings().apiKey).toBe('secret-a');
    await store.saveSettings({ ...store.getSettings(), endpoint: 'https://another.example/v1' });
    expect(store.getProviderSettings().apiKey).toBe('');
    await store.saveSettings({ ...store.getSettings(), ...original });
    expect(store.getProviderSettings().apiKey).toBe('secret-a');
    await store.saveSettings({ ...store.getSettings(), clearApiKey: true });
    expect(store.getProviderSettings().apiKey).toBe('');
    expect(store.getSettings()).not.toHaveProperty('clearApiKey');
  });
  it('serializes parallel app/mobile updates without losing cards or review ratings', async () => {
    const store = makeStore();
    await store.init();
    const entries = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.add({ ...analysis, original: `Card ${index}` }, store.getSettings()),
      ),
    );
    expect(store.list()).toHaveLength(12);
    await Promise.all([
      store.rate(entries[0].id, 'good'),
      store.rate(entries[0].id, 'good'),
      store.rate(entries[0].id, 'good'),
    ]);
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()).toHaveLength(12);
    expect(restarted.list().find((entry) => entry.id === entries[0].id)?.review).toMatchObject({
      repetitions: 3,
      interval: 8,
    });
  });
  it('preserves personal Markdown annotations and writes an updated review index', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(analysis, store.getSettings());
    const entryDir = path.join(store.getLibraryDirectory(), 'entries');
    const file = path.join(entryDir, (await fs.readdir(entryDir))[0]);
    await fs.appendFile(file, '\nMy own example and annotation.\n');
    await store.rate(entry.id, 'easy');
    expect(await fs.readFile(file, 'utf8')).toContain('My own example and annotation.');
    const index = await fs.readFile(path.join(store.getLibraryDirectory(), 'index.md'), 'utf8');
    expect(index).toContain(entry.id);
    expect(index).toContain('不会导入手机对 Markdown 的修改为复习进度');
    const restarted = makeStore();
    await restarted.init();
    expect(await fs.readFile(file, 'utf8')).toContain('My own example and annotation.');
  });
  it('keeps user files when choosing a sync folder and mirrors existing entries there', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(analysis, store.getSettings());
    const sync = path.join(directory, 'sync');
    await fs.mkdir(sync);
    await fs.writeFile(path.join(sync, 'personal.md'), 'keep me');
    await store.setLibraryPath(sync);
    expect(await fs.readFile(path.join(sync, 'personal.md'), 'utf8')).toBe('keep me');
    expect((await fs.readdir(path.join(sync, 'LingoLeaf', 'entries')))[0]).toContain(entry.id);
    expect(store.getSettings().libraryPath).toBe(sync);
  });
  it('deletes only the selected card and its Markdown, with no lost later update', async () => {
    const store = makeStore();
    await store.init();
    const first = await store.add(analysis, store.getSettings());
    const second = await store.add({ ...analysis, original: 'Another card' }, store.getSettings());
    await store.remove(first.id);
    expect(store.list().map((entry) => entry.id)).toEqual([second.id]);
    expect(await fs.readdir(path.join(store.getLibraryDirectory(), 'entries'))).toHaveLength(1);
    await expect(store.rate(first.id, 'good')).rejects.toThrow('不存在');
    await expect(store.rate(second.id, 'good')).resolves.toMatchObject({ id: second.id });
  });
  it('keeps committed cards available when the Markdown directory becomes unavailable', async () => {
    const store = makeStore();
    await store.init();
    await fs.rm(store.getLibraryDirectory(), { recursive: true });
    await fs.writeFile(store.getLibraryDirectory(), 'a file now blocks the mirror directory');
    const entry = await store.add(analysis, store.getSettings());
    expect(store.list()[0].id).toBe(entry.id);
    expect(store.getSyncError()).toContain('Markdown 同步失败');
    const persisted = JSON.parse(await fs.readFile(path.join(directory, 'library.json'), 'utf8'));
    expect(persisted.entries[0].id).toBe(entry.id);
  });
  it('never publishes a partial immutable note and retries failed publication from committed data', async () => {
    const store = makeStore();
    await store.init();
    vi.spyOn(fs, 'link').mockRejectedValueOnce(
      Object.assign(new Error('disk failure'), { code: 'EIO' }),
    );
    const entry = await store.add(analysis, store.getSettings());
    const entriesDir = path.join(store.getLibraryDirectory(), 'entries');
    expect(await fs.readdir(entriesDir)).toEqual([]);
    expect(store.getSyncError()).toContain('Markdown 同步失败');
    await store.rate(entry.id, 'good');
    const filenames = await fs.readdir(entriesDir);
    expect(filenames).toHaveLength(1);
    expect(await fs.readFile(path.join(entriesDir, filenames[0]), 'utf8')).toContain('## 我的笔记');
    expect(store.getSyncError()).toBeNull();
  });
  it('does not overwrite corrupt storage or accept an invalid new folder', async () => {
    const store = makeStore();
    await store.init();
    const previous = store.getSettings().libraryPath;
    const unavailable = path.join(directory, 'not-a-directory');
    await fs.writeFile(unavailable, 'keep me');
    await expect(store.setLibraryPath(unavailable)).rejects.toThrow();
    expect(store.getSettings().libraryPath).toBe(previous);
    await fs.writeFile(path.join(directory, 'library.json'), '{ corrupt');
    await expect(makeStore().init()).rejects.toThrow('原文件已保留');
    expect(await fs.readFile(path.join(directory, 'library.json'), 'utf8')).toBe('{ corrupt');
  });
  it('returns copies so renderer/mobile callers cannot silently mutate persisted state', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(analysis, store.getSettings());
    entry.review.interval = 100;
    const list = store.list();
    list[0].issues[0].rule = 'changed';
    expect(store.list()[0].review.interval).toBe(0);
    expect(store.list()[0].issues[0].rule).toBe('主谓一致');
  });
  it('renders hostile Markdown/HTML as literal teaching content without escaping its code fence', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(
      {
        ...analysis,
        original: '```\n<script>alert(1)</script>\n[link](evil)',
        explanation: '<script>alert(1)</script> [click](javascript:evil)',
        tags: ['[evil](javascript:evil)'],
      },
      store.getSettings(),
    );
    const markdown = renderEntryMarkdown(entry);
    expect(markdown).toContain('````text\n```');
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).toContain('\\[click\\]\\(javascript:evil\\)');
  });
});

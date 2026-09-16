import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore, renderEntryMarkdown } from '../src/main/store';
import type { Analysis, AppearanceSettings } from '../src/shared/types';

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
  translation: '她去上学。',
  translationLanguage: '简体中文',
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
  it('loads pre-protocol settings and preserves credentials and notes when selecting Responses', async () => {
    const original = makeStore();
    await original.init();
    await original.saveSettings({
      ...original.getSettings(),
      provider: 'compatible',
      endpoint: 'http://localhost:8765/codex',
      apiKey: 'existing-key',
    });
    const entry = await original.add(analysis, original.getSettings());
    const configPath = path.join(directory, 'settings.json');
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
    delete saved.settings.requestProtocol;
    delete saved.settings.theme;
    delete saved.settings.fontSize;
    await fs.writeFile(configPath, JSON.stringify(saved));

    const migrated = makeStore();
    await migrated.init();
    expect(migrated.getSettings().requestProtocol).toBe('auto');
    expect(migrated.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
    expect(migrated.getProviderSettings().apiKey).toBe('existing-key');
    expect(migrated.list()).toEqual([entry]);
    await migrated.saveSettings({ ...migrated.getSettings(), requestProtocol: 'responses' });

    const restarted = makeStore();
    await restarted.init();
    expect(restarted.getSettings()).toMatchObject({
      requestProtocol: 'responses',
      hasApiKey: true,
      apiKey: '',
    });
    expect(restarted.getProviderSettings().apiKey).toBe('existing-key');
    expect(restarted.list()).toEqual([entry]);
    expect(await fs.readdir(path.join(restarted.getLibraryDirectory(), 'entries'))).toHaveLength(1);
  });
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
    expect(note).toContain('## 译文 · 简体中文\n\n```text\n她去上学。\n```');
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
  it('loads legacy grammar notes without a translation and preserves their annotations', async () => {
    const { translation: _translation, translationLanguage: _language, ...legacy } = analysis;
    const store = makeStore();
    await store.init();
    const entry = await store.add(legacy, store.getSettings());
    const entryDir = path.join(store.getLibraryDirectory(), 'entries');
    const notePath = path.join(entryDir, (await fs.readdir(entryDir))[0]);
    await fs.appendFile(notePath, '\nMy original annotation must survive.\n');
    const originalNote = await fs.readFile(notePath, 'utf8');
    expect(originalNote).not.toContain('## 译文');

    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()).toEqual([entry]);
    expect(restarted.list()[0]).not.toHaveProperty('translation');
    expect(restarted.list()[0]).not.toHaveProperty('translationLanguage');
    await restarted.rate(entry.id, 'good');
    expect(await fs.readFile(notePath, 'utf8')).toBe(originalNote);
  });
  it('persists a formatted grammar translation with the request settings language across later changes', async () => {
    const store = makeStore();
    await store.init();
    const translation = '每日计划：\n\n1. 她去上学。\n   - 她学习英语。';
    const entry = await store.add(
      { ...analysis, translation, translationLanguage: 'untrusted-model-language' },
      store.getSettings(),
    );
    expect(entry.translationLanguage).toBe('简体中文');
    expect(entry.translation).toBe(translation);
    expect(entry.corrected).toBe(analysis.corrected);
    await store.saveSettings({ ...store.getSettings(), explanationLanguage: '日本語' });

    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()[0]).toMatchObject({ translation, translationLanguage: '简体中文' });
    const markdown = renderEntryMarkdown(restarted.list()[0]);
    expect(markdown).toContain(`## 译文 · 简体中文\n\n\`\`\`text\n${translation}\n\`\`\``);
    const entryDir = path.join(restarted.getLibraryDirectory(), 'entries');
    expect(await fs.readFile(path.join(entryDir, (await fs.readdir(entryDir))[0]), 'utf8')).toBe(
      markdown,
    );
  });
  it('keeps translation-mode notes to their intended translation without a second language section', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(
      { ...analysis, mode: 'translate', original: '她去上学。', isCorrect: true, issues: [] },
      store.getSettings(),
    );
    expect(entry.corrected).toBe(analysis.corrected);
    expect(entry).not.toHaveProperty('translation');
    expect(entry).not.toHaveProperty('translationLanguage');
    const markdown = renderEntryMarkdown(entry);
    expect(markdown.match(/## 译文/g)).toHaveLength(1);
    expect(markdown).not.toContain('## 译文 ·');
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
    const warning = store.getSyncError();
    await store.saveAppearance({ theme: 'ocean', fontSize: 'large' });
    expect(store.getSyncError()).toBe(warning);
    expect(store.getAppearance().theme).toBe('ocean');
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
        translation: '```\n<img src=x onerror=alert(1)>\n[译文](javascript:evil)',
        explanation: '<script>alert(1)</script> [click](javascript:evil)',
        tags: ['[evil](javascript:evil)'],
      },
      store.getSettings(),
    );
    const markdown = renderEntryMarkdown(entry);
    expect(markdown).toContain('````text\n```');
    expect(markdown).toContain('````text\n```\n<img src=x onerror=alert(1)>\n[译文](javascript:evil)\n````');
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).toContain('\\[click\\]\\(javascript:evil\\)');
  });
});

describe('scoped appearance persistence', () => {
  it('loads pre-appearance settings without changing a selected protocol, credentials or notes', async () => {
    const original = makeStore();
    await original.init();
    await original.saveSettings({
      ...original.getSettings(),
      provider: 'compatible',
      endpoint: 'https://provider.example/v1',
      requestProtocol: 'responses',
      model: 'configured-model',
      apiKey: 'keep-existing-key',
      targetLanguage: 'Deutsch',
    });
    const entry = await original.add(analysis, original.getSettings());
    const entryDirectory = path.join(original.getLibraryDirectory(), 'entries');
    const notePath = path.join(entryDirectory, (await fs.readdir(entryDirectory))[0]);
    await fs.appendFile(notePath, '\nMy existing learning annotation.\n');
    const note = await fs.readFile(notePath, 'utf8');
    const settingsPath = path.join(directory, 'settings.json');
    const saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    delete saved.settings.theme;
    delete saved.settings.fontSize;
    await fs.writeFile(settingsPath, JSON.stringify(saved));

    const migrated = makeStore();
    await migrated.init();
    expect(migrated.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
    expect(migrated.getSettings()).toMatchObject({
      requestProtocol: 'responses',
      provider: 'compatible',
      endpoint: 'https://provider.example/v1',
      model: 'configured-model',
      targetLanguage: 'Deutsch',
      hasApiKey: true,
      apiKey: '',
    });
    expect(migrated.getProviderSettings().apiKey).toBe('keep-existing-key');
    expect(migrated.list()).toEqual([entry]);
    expect(await fs.readFile(notePath, 'utf8')).toBe(note);
  });

  it('persists scoped appearance across restart and returns detached appearance values', async () => {
    const store = makeStore();
    await store.init();
    expect(store.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
    const saved = await store.saveAppearance({ theme: 'system', fontSize: 'extra-large' });
    expect(saved).toEqual({ theme: 'system', fontSize: 'extra-large' });
    saved.theme = 'forest';
    expect(store.getAppearance().theme).toBe('system');
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.getAppearance()).toEqual({ theme: 'system', fontSize: 'extra-large' });
    expect(restarted.getSettings()).toMatchObject({ theme: 'system', fontSize: 'extra-large' });
  });

  it('rejects invalid or incomplete appearance payloads without writing settings', async () => {
    const store = makeStore();
    await store.init();
    const settingsPath = path.join(directory, 'settings.json');
    const before = await fs.readFile(settingsPath, 'utf8');
    const writes = vi.spyOn(fs, 'open');
    for (const value of [
      null,
      [],
      {},
      { theme: 'unknown', fontSize: 'large' },
      { theme: 'forest', fontSize: 'huge' },
      { theme: 'ocean' },
      { fontSize: 'large' },
      { theme: 'lavender', fontSize: 'standard', apiKey: 'not-an-appearance-field' },
    ]) {
      await expect(store.saveAppearance(value as AppearanceSettings)).rejects.toThrow(
        '外观设置无效',
      );
    }
    expect(writes).not.toHaveBeenCalled();
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(before);
    expect(store.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
  });

  it('writes only settings, preserving provider credentials and all Markdown/library files', async () => {
    const store = makeStore();
    await store.init();
    await store.saveSettings({
      ...store.getSettings(),
      provider: 'compatible',
      endpoint: 'https://provider.example/v1',
      requestProtocol: 'responses',
      apiKey: 'keep-this-encrypted',
      model: 'configured-model',
    });
    await store.add(analysis, store.getSettings());
    const entryDirectory = path.join(store.getLibraryDirectory(), 'entries');
    const paths = [
      path.join(store.getLibraryDirectory(), 'index.md'),
      path.join(entryDirectory, (await fs.readdir(entryDirectory))[0]),
      path.join(directory, 'library.json'),
    ];
    const contents = await Promise.all(paths.map((filename) => fs.readFile(filename, 'utf8')));
    const fixedTime = new Date('2001-01-01T00:00:00.000Z');
    await Promise.all(paths.map((filename) => fs.utimes(filename, fixedTime, fixedTime)));
    const previousSettings = store.getProviderSettings();
    const previousEntries = store.list();
    await store.saveAppearance({ theme: 'midnight', fontSize: 'extra-large' });

    expect(store.getProviderSettings()).toEqual({
      ...previousSettings,
      theme: 'midnight',
      fontSize: 'extra-large',
    });
    expect(store.list()).toEqual(previousEntries);
    expect(await Promise.all(paths.map((filename) => fs.readFile(filename, 'utf8')))).toEqual(
      contents,
    );
    expect(
      await Promise.all(paths.map(async (filename) => (await fs.stat(filename)).mtimeMs)),
    ).toEqual(paths.map(() => fixedTime.getTime()));
    const persisted = await fs.readFile(path.join(directory, 'settings.json'), 'utf8');
    expect(persisted).not.toContain('keep-this-encrypted');
    expect(JSON.parse(persisted).credentials).toEqual({
      'compatible:https://provider.example/v1': protect('keep-this-encrypted'),
    });
  });

  it('merges both save APIs inside the queue so stale full settings cannot revert appearance', async () => {
    const store = makeStore();
    await store.init();
    await store.saveSettings({ ...store.getSettings(), apiKey: 'retained-key' });
    const staleDraft = store.getSettings();
    const [firstSettings, firstAppearance, staleSave, lastAppearance] = await Promise.all([
      store.saveSettings({ ...staleDraft, model: 'model-before-theme' }),
      store.saveAppearance({ theme: 'midnight', fontSize: 'extra-large' }),
      store.saveSettings({
        ...staleDraft,
        model: 'model-after-theme',
        theme: 'forest',
        fontSize: 'standard',
      }),
      store.saveAppearance({ theme: 'ocean', fontSize: 'large' }),
    ]);
    expect(firstSettings.model).toBe('model-before-theme');
    expect(firstAppearance).toEqual({ theme: 'midnight', fontSize: 'extra-large' });
    expect(staleSave).toMatchObject({
      model: 'model-after-theme',
      theme: 'midnight',
      fontSize: 'extra-large',
    });
    expect(lastAppearance).toEqual({ theme: 'ocean', fontSize: 'large' });
    expect(store.getProviderSettings()).toMatchObject({
      model: 'model-after-theme',
      apiKey: 'retained-key',
      theme: 'ocean',
      fontSize: 'large',
    });

    await store.saveSettings({ ...store.getSettings(), theme: 'lavender', fontSize: 'standard' });
    expect(store.getAppearance()).toEqual({ theme: 'ocean', fontSize: 'large' });
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.getAppearance()).toEqual({ theme: 'ocean', fontSize: 'large' });
    expect(restarted.getProviderSettings().model).toBe('model-after-theme');
  });

  it('leaves the last saved appearance intact after a failed atomic write and permits retry', async () => {
    const store = makeStore();
    await store.init();
    const settingsPath = path.join(directory, 'settings.json');
    const before = await fs.readFile(settingsPath, 'utf8');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('write denied'), { code: 'EACCES' }),
    );
    await expect(
      store.saveAppearance({ theme: 'lavender', fontSize: 'standard' }),
    ).rejects.toThrow();
    expect(store.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(before);
    await expect(
      store.saveAppearance({ theme: 'lavender', fontSize: 'standard' }),
    ).resolves.toEqual({ theme: 'lavender', fontSize: 'standard' });
  });
});

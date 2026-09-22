import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore, renderEntryMarkdown } from '../src/main/store';
import type { Analysis, AppearanceSettings, UiLanguage } from '../src/shared/types';

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
    delete saved.settings.uiLanguage;
    await fs.writeFile(configPath, JSON.stringify(saved));

    const migrated = makeStore();
    await migrated.init();
    expect(migrated.getSettings().requestProtocol).toBe('auto');
    expect(migrated.getAppearance()).toEqual({ theme: 'forest', fontSize: 'large' });
    expect(migrated.getUiLanguage()).toBe('zh-CN');
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

describe('reading, expression exploration and saved tutoring', () => {
  const reading: Analysis = {
    ...analysis,
    mode: 'read',
    original: 'Although it rained, we went for a walk.',
    corrected: '虽然下雨了，我们还是出去散步。',
    isCorrect: true,
    issues: [],
    explanation: 'Although 引导让步状语从句。',
    grammarPoints: [{ text: 'Although it rained', explanation: '让步状语从句，表示与主句预期相反的情况。' }],
    keyPoints: ['Although 表示“虽然”，不要同时使用 but。'],
  };
  const expressing: Analysis = {
    ...analysis,
    mode: 'express',
    original: '想表达很想帮忙，但是最近事情有点多。',
    corrected: 'I would love to help, but I have a lot on my plate right now.',
    isCorrect: true,
    issues: [],
    explanation: '先表达意愿，再礼貌说明暂时忙碌。',
    keyPoints: ['have a lot on my plate 表示手头事情很多。'],
    alternatives: [
      { text: 'I would be happy to help once my schedule clears up.', tone: '礼貌', explanation: '没有承诺具体日期。' },
      { text: 'I am a little swamped right now, but I would love to help later.', tone: '轻松', explanation: '适合熟悉的朋友。' },
    ],
    clarificationQuestions: ['你是在回复同事，还是朋友？'],
    expressionContext: '回复同事的请求',
    expressionTone: '礼貌、轻松',
  };
  it('persists reading direction and expression context with complete learning Markdown', async () => {
    const store = makeStore();
    await store.init();
    const settings = { ...store.getSettings(), targetLanguage: 'English', explanationLanguage: '简体中文' };
    const read = await store.add(reading, settings);
    const express = await store.add(expressing, settings);
    expect(read).toMatchObject({ sourceLanguage: 'English', targetLanguage: '简体中文', grammarPoints: reading.grammarPoints, keyPoints: reading.keyPoints });
    expect(express).toMatchObject({ sourceLanguage: 'Auto', targetLanguage: 'English', alternatives: expressing.alternatives, expressionContext: expressing.expressionContext, expressionTone: expressing.expressionTone, clarificationQuestions: expressing.clarificationQuestions });
    expect(read).not.toHaveProperty('translation');
    expect(express).not.toHaveProperty('translation');
    await store.saveSettings({ ...settings, targetLanguage: 'Deutsch', explanationLanguage: '日本語' });
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list().find((entry) => entry.id === read.id)).toEqual(read);
    expect(restarted.list().find((entry) => entry.id === express.id)).toEqual(express);
    const readMarkdown = renderEntryMarkdown(read);
    expect(readMarkdown).toContain('# 阅读解析');
    expect(readMarkdown).toContain('## 语法结构');
    expect(readMarkdown).toContain('Although it rained');
    expect(readMarkdown).toContain('## 要点摘要');
    const expressMarkdown = renderEntryMarkdown(express);
    for (const value of ['# 表达探索', '## 建议表达', '## 其他表达', '## 可以再想一想', '## 表达场景', '回复同事的请求', '## 表达语气', '礼貌、轻松']) expect(expressMarkdown).toContain(value);
    const index = await fs.readFile(path.join(store.getLibraryDirectory(), 'index.md'), 'utf8');
    expect(index).toContain('阅读解析');
    expect(index).toContain('表达探索');
  });
  it('loads an old library without adding fields or rewriting its JSON, settings or notes', async () => {
    const store = makeStore();
    await store.init();
    const { translation: _translation, translationLanguage: _language, ...legacy } = analysis;
    const entry = await store.add(legacy, store.getSettings());
    const notePath = path.join(store.getLibraryDirectory(), 'entries', (await fs.readdir(path.join(store.getLibraryDirectory(), 'entries')))[0]);
    await fs.appendFile(notePath, '\nPersonal notes from v0.1.0.\n');
    const paths = [path.join(directory, 'settings.json'), path.join(directory, 'library.json'), notePath];
    const before = await Promise.all(paths.map((file) => fs.readFile(file, 'utf8')));
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()).toEqual([entry]);
    expect(restarted.list()[0]).not.toHaveProperty('conversation');
    expect(await Promise.all(paths.map((file) => fs.readFile(file, 'utf8')))).toEqual(before);
  });
  it('saves tutoring across restart and preserves original notes, sidecar annotations and review state', async () => {
    const store = makeStore();
    await store.init();
    const original = await store.add(reading, store.getSettings());
    const noteDir = path.join(store.getLibraryDirectory(), 'entries');
    const notePath = path.join(noteDir, (await fs.readdir(noteDir))[0]);
    await fs.appendFile(notePath, '\nKeep this annotation.\n');
    const note = await fs.readFile(notePath, 'utf8');
    const first = await store.addConversation(original.id, '  为什么不用 but？  ', '因为 although 已经表达让步关系。\n\n  保留换行和缩进。');
    expect(first.review).toEqual(original.review);
    expect(first.original).toBe(original.original);
    expect(first.corrected).toBe(original.corrected);
    expect(first.conversation).toHaveLength(1);
    const turn = first.conversation![0];
    expect(turn).toMatchObject({ question: '为什么不用 but？', answer: '因为 although 已经表达让步关系。\n\n  保留换行和缩进。' });
    expect(turn.id).toMatch(/^[a-f\d-]{36}$/);
    expect(Date.parse(turn.createdAt)).not.toBeNaN();
    const sidecarDir = path.join(store.getLibraryDirectory(), 'conversations');
    const sidecarPath = path.join(sidecarDir, `${original.id}-${turn.id}.md`);
    const firstSidecar = await fs.readFile(sidecarPath, 'utf8');
    expect(firstSidecar).toContain(original.original);
    expect(firstSidecar).toContain('为什么不用 but？');
    expect(firstSidecar).toContain('[原始学习笔记](../entries/');
    await fs.appendFile(sidecarPath, '\nMy own follow-up annotation.\n');
    const annotatedSidecar = await fs.readFile(sidecarPath, 'utf8');
    first.conversation![0].answer = 'Cannot mutate saved turns through the return value';
    const second = await store.addConversation(original.id, '可以给个例句吗？', 'Although I was tired, I finished the work.');
    expect(second.conversation).toHaveLength(2);
    expect(second.conversation![0].answer).toContain('although');
    const reloaded = makeStore();
    await reloaded.init();
    expect(reloaded.list()).toEqual([second]);
    expect(await fs.readFile(notePath, 'utf8')).toBe(note);
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe(annotatedSidecar);
    expect(await fs.readdir(sidecarDir)).toHaveLength(2);
    const index = await fs.readFile(path.join(store.getLibraryDirectory(), 'index.md'), 'utf8');
    for (const current of second.conversation!) expect(index).toContain(`conversations/${original.id}-${current.id}.md`);
    const exported = renderEntryMarkdown(second);
    expect(exported).toContain('## 追问与回答');
    expect(exported).toContain('为什么不用 but？');
    expect(exported).toContain('Although I was tired, I finished the work.');
  });
  it('validates tutoring boundaries without changing persisted data', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(reading, store.getSettings());
    const before = await fs.readFile(path.join(directory, 'library.json'), 'utf8');
    for (const [question, answer] of [['', 'answer'], [' \n ', 'answer'], ['x'.repeat(4001), 'answer'], ['question', ''], ['question', ' \n '], ['question', 'x'.repeat(12001)]]) {
      await expect(store.addConversation(entry.id, question, answer)).rejects.toThrow('追问内容无效');
    }
    await expect(store.addConversation('not-an-entry', 'question', 'answer')).rejects.toThrow('不存在');
    expect(await fs.readFile(path.join(directory, 'library.json'), 'utf8')).toBe(before);
    const valid = await store.addConversation(entry.id, 'x'.repeat(4000), 'y'.repeat(12000));
    expect(valid.conversation![0].question).toHaveLength(4000);
    expect(valid.conversation![0].answer).toHaveLength(12000);
  });
  it('serializes simultaneous turns and enforces the limit without losing review updates', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(reading, store.getSettings());
    const results = await Promise.allSettled([
      ...Array.from({ length: 21 }, (_, i) => store.addConversation(entry.id, `Question ${i}`, `Answer ${i}`)),
      store.rate(entry.id, 'good'),
    ]);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results[20]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('20 轮') }) });
    const current = store.list()[0];
    expect(current.conversation).toHaveLength(20);
    expect(current.conversation!.map((turn) => turn.question)).toEqual(Array.from({ length: 20 }, (_, i) => `Question ${i}`));
    expect(new Set(current.conversation!.map((turn) => turn.id)).size).toBe(20);
    expect(current.review.repetitions).toBe(1);
    const reloaded = makeStore();
    await reloaded.init();
    expect(reloaded.list()).toEqual([current]);
  }, 15000);
  it('does not commit a turn after a failed JSON write and permits a clean retry', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(reading, store.getSettings());
    const before = await fs.readFile(path.join(directory, 'library.json'), 'utf8');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('disk denied'), { code: 'EACCES' }));
    await expect(store.addConversation(entry.id, 'Question', 'Answer')).rejects.toThrow('disk denied');
    expect(store.list()[0]).not.toHaveProperty('conversation');
    expect(await fs.readFile(path.join(directory, 'library.json'), 'utf8')).toBe(before);
    const retried = await store.addConversation(entry.id, 'Question', 'Answer');
    expect(retried.conversation).toHaveLength(1);
    expect(await fs.readdir(path.join(store.getLibraryDirectory(), 'conversations'))).toHaveLength(1);
  });
  it('retains a committed turn during sidecar failure and recreates the complete sidecar on restart', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(reading, store.getSettings());
    vi.spyOn(fs, 'link').mockRejectedValueOnce(Object.assign(new Error('disk unavailable'), { code: 'EIO' }));
    const saved = await store.addConversation(entry.id, 'Question', 'Answer');
    expect(store.getSyncError()).toContain('Markdown 同步失败');
    expect(store.list()).toEqual([saved]);
    const sidecarDir = path.join(store.getLibraryDirectory(), 'conversations');
    expect(await fs.readdir(sidecarDir)).toEqual([]);
    const reloaded = makeStore();
    await reloaded.init();
    expect(reloaded.list()).toEqual([saved]);
    expect(reloaded.getSyncError()).toBeNull();
    const sidecars = await fs.readdir(sidecarDir);
    expect(sidecars).toHaveLength(1);
    expect(await fs.readFile(path.join(sidecarDir, sidecars[0]), 'utf8')).toContain('## 我的笔记');
  });
  it('deletes only a selected entry and its exact saved sidecars', async () => {
    const store = makeStore();
    await store.init();
    const first = await store.add(reading, store.getSettings());
    const second = await store.add(expressing, store.getSettings());
    const savedFirst = await store.addConversation(first.id, 'Question 1', 'Answer 1');
    const savedSecond = await store.addConversation(second.id, 'Question 2', 'Answer 2');
    const sidecarDir = path.join(store.getLibraryDirectory(), 'conversations');
    const unrelated = path.join(sidecarDir, `${first.id}-personal.md`);
    await fs.writeFile(unrelated, 'This file is not managed by the app.');
    await store.remove(first.id);
    expect(store.list()).toEqual([savedSecond]);
    const files = await fs.readdir(sidecarDir);
    expect(files).not.toContain(`${first.id}-${savedFirst.conversation![0].id}.md`);
    expect(files).toContain(`${second.id}-${savedSecond.conversation![0].id}.md`);
    expect(await fs.readFile(unrelated, 'utf8')).toBe('This file is not managed by the app.');
    const reloaded = makeStore();
    await reloaded.init();
    expect(reloaded.list()).toEqual([savedSecond]);
  });
  it('escapes new teaching fields and fences tutoring text without interpreting model HTML or links', async () => {
    const store = makeStore();
    await store.init();
    const malicious = '<script>alert(1)</script> [click](javascript:evil)';
    const entry = await store.add({
      ...expressing,
      grammarPoints: [{ text: '```\n<img src=x>', explanation: malicious }],
      keyPoints: [malicious],
      alternatives: [{ text: '```\n<img src=x>', tone: malicious, explanation: malicious }],
      clarificationQuestions: [malicious],
      expressionContext: malicious,
      expressionTone: malicious,
    }, store.getSettings());
    const saved = await store.addConversation(entry.id, '```\n<img src=x>', '````\n<script>alert(1)</script>');
    const markdown = renderEntryMarkdown(saved);
    expect(markdown).toContain('&lt;script&gt;');
    expect(markdown).toContain('\\[click\\]\\(javascript:evil\\)');
    expect(markdown).toContain('````text\n```\n<img src=x>\n````');
    expect(markdown).toContain('`````text\n````\n<script>alert(1)</script>\n`````');
    const sidecarDir = path.join(store.getLibraryDirectory(), 'conversations');
    expect(await fs.readFile(path.join(sidecarDir, (await fs.readdir(sidecarDir))[0]), 'utf8')).toContain('`````text\n````\n<script>alert(1)</script>\n`````');
  });
});

describe('formal wording persistence and scoped interface language', () => {
  const professional = {
    text: 'She attends school.\n\n  - A literal <script> and ``` are preserved.',
    explanation: '适合正式语境；保留原意与确定程度。',
    improvements: ['用 attend 描述上学。', '保留 <label> 与多行\n  缩进。'],
  };
  it('persists formal wording across restart, Markdown and export without changing corrected', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add({ ...analysis, professional }, store.getSettings());
    expect(entry.corrected).toBe(analysis.corrected);
    expect(entry.isCorrect).toBe(analysis.isCorrect);
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()[0].professional).toEqual(professional);
    const directory = path.join(store.getLibraryDirectory(), 'entries');
    const note = await fs.readFile(path.join(directory, (await fs.readdir(directory))[0]), 'utf8');
    expect(note).toBe(renderEntryMarkdown(entry));
    expect(note).toContain('## 专业 / 正式表达');
    expect(note).toContain(professional.text);
    expect(note).toContain('### 写作提升要点');
    expect(note).toContain('&lt;label&gt;');
  });
  it('keeps old notes and their annotations unchanged without inventing formal wording', async () => {
    const store = makeStore();
    await store.init();
    const entry = await store.add(analysis, store.getSettings());
    const notes = path.join(store.getLibraryDirectory(), 'entries');
    const notePath = path.join(notes, (await fs.readdir(notes))[0]);
    const annotated = (await fs.readFile(notePath, 'utf8')) + '\nMy personal note.';
    await fs.writeFile(notePath, annotated);
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.list()[0]).not.toHaveProperty('professional');
    expect(renderEntryMarkdown(entry)).not.toContain('## 专业 / 正式表达');
    expect(await fs.readFile(notePath, 'utf8')).toBe(annotated);
  });
  it('does not store formal grammar wording in other learning modes', async () => {
    const store = makeStore();
    await store.init();
    for (const mode of ['translate', 'read', 'express'] as const) {
      const entry = await store.add({ ...analysis, mode, professional }, store.getSettings());
      expect(entry).not.toHaveProperty('professional');
      expect(renderEntryMarkdown(entry)).not.toContain('## 专业 / 正式表达');
    }
  });
  it('persists every interface language independently of model languages, credentials and learning data', async () => {
    const store = makeStore();
    await store.init();
    await store.saveSettings({ ...store.getSettings(), apiKey: 'private-key', targetLanguage: 'English', explanationLanguage: '日本語' });
    await store.add(analysis, store.getSettings());
    const notes = path.join(store.getLibraryDirectory(), 'entries');
    const paths = [path.join(directory, 'library.json'), path.join(store.getLibraryDirectory(), 'index.md'), path.join(notes, (await fs.readdir(notes))[0])];
    const before = await Promise.all(paths.map((file) => fs.readFile(file, 'utf8')));
    for (const language of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es'] as const) {
      expect(await store.saveUiLanguage(language)).toBe(language);
      expect(store.getProviderSettings()).toMatchObject({ uiLanguage: language, apiKey: 'private-key', targetLanguage: 'English', explanationLanguage: '日本語' });
    }
    expect(await Promise.all(paths.map((file) => fs.readFile(file, 'utf8')))).toEqual(before);
    const restarted = makeStore();
    await restarted.init();
    expect(restarted.getUiLanguage()).toBe('es');
    expect(restarted.getProviderSettings().apiKey).toBe('private-key');
    expect(await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).not.toContain('private-key');
  });
  it('merges scoped language changes with queued appearance and stale full settings saves', async () => {
    const store = makeStore();
    await store.init();
    const stale = store.getSettings();
    await Promise.all([
      store.saveUiLanguage('ja'),
      store.saveAppearance({ theme: 'midnight', fontSize: 'extra-large' }),
      store.saveSettings({ ...stale, model: 'new-model' }),
      store.saveUiLanguage('es'),
      store.saveSettings({ ...stale, model: 'latest-model' }),
    ]);
    expect(store.getSettings()).toMatchObject({ uiLanguage: 'es', model: 'latest-model', theme: 'midnight', fontSize: 'extra-large' });
  });
  it('rejects unsupported language values without writing and recovers after an atomic failure', async () => {
    const store = makeStore();
    await store.init();
    const settingsPath = path.join(directory, 'settings.json');
    const before = await fs.readFile(settingsPath, 'utf8');
    const writes = vi.spyOn(fs, 'open');
    for (const value of [undefined, null, '', 'fr', 'EN', [], {}, { uiLanguage: 'en' }]) {
      await expect(store.saveUiLanguage(value as UiLanguage)).rejects.toThrow('界面语言无效');
    }
    expect(writes).not.toHaveBeenCalled();
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('write denied'));
    await expect(store.saveUiLanguage('ko')).rejects.toThrow('write denied');
    expect(store.getUiLanguage()).toBe('zh-CN');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(before);
    await expect(store.saveUiLanguage('ko')).resolves.toBe('ko');
  });
});

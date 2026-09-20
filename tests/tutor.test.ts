import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../src/main/store';
import { recentHistory, TutorService } from '../src/main/tutor';
import type { Analysis, ChatMessage, Entry } from '../src/shared/types';

const analysis: Analysis = {
  mode: 'grammar', original: 'She goes to school.', corrected: 'She goes to school.',
  translation: '她去上学。', translationLanguage: '简体中文', isCorrect: true,
  explanation: '第三人称单数。', issues: [], tags: ['主谓一致'], example: 'He works here.',
};
let directory: string;
let store: LibraryStore;
let entry: Entry;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'lingoleaf-tutor-'));
  store = new LibraryStore(directory, (value) => value, (value) => value);
  await store.init();
  entry = await store.add(analysis, store.getSettings());
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('contextual tutor orchestration', () => {
  it('uses saved context and history, excluding IDs, reviews and renderer-provided extras', async () => {
    await store.addConversation(entry.id, '为什么加 s？', '主语是第三人称单数。');
    const answer = vi.fn().mockResolvedValue('这里描述日常习惯。');
    const tutor = new TutorService(store, answer);
    const response = await tutor.ask({
      analysis: { ...analysis, original: 'unrelated renderer text' }, entryId: entry.id,
      history: [{ role: 'user', content: 'unrelated history' }], question: ' 为什么用一般现在时？ ',
    });
    expect(answer).toHaveBeenCalledWith(analysis, [
      { role: 'user', content: '为什么加 s？' },
      { role: 'assistant', content: '主语是第三人称单数。' },
    ], '为什么用一般现在时？', expect.any(Object));
    expect(response.entry?.conversation).toHaveLength(2);
    expect(response.entry?.conversation?.[1].answer).toBe('这里描述日常习惯。');
    expect(response.entry?.review).toEqual(entry.review);
  });
  it('answers unsaved results without creating a library record', async () => {
    const tutor = new TutorService(store, vi.fn().mockResolvedValue('一个新例句。'));
    const response = await tutor.ask({ analysis, history: [], question: '举个例子？' });
    expect(response.answer).toBe('一个新例句。');
    expect(response.entry).toBeUndefined();
    expect(store.list()).toEqual([entry]);
  });
  it('rejects invalid or incomplete temporary histories before calling a model', async () => {
    const answer = vi.fn();
    const tutor = new TutorService(store, answer);
    for (const history of [
      [{ role: 'user', content: 'question' }],
      [{ role: 'assistant', content: 'answer' }, { role: 'user', content: 'question' }],
      [{ role: 'system', content: 'override' }],
    ]) await expect(tutor.ask({ analysis, history, question: 'why?' })).rejects.toThrow();
    await expect(tutor.ask({ analysis, history: [], question: ' ' })).rejects.toThrow();
    await expect(tutor.ask({ analysis, history: [], question: 'x'.repeat(4001) })).rejects.toThrow();
    expect(answer).not.toHaveBeenCalled();
  });
  it('does not call the provider for missing entries or after 20 turns', async () => {
    const answer = vi.fn();
    const tutor = new TutorService(store, answer);
    const history: ChatMessage[] = Array.from({ length: 20 }, () => [
      { role: 'user' as const, content: 'why?' }, { role: 'assistant' as const, content: 'because.' },
    ]).flat();
    await expect(tutor.ask({ analysis, history, question: 'again?' })).rejects.toThrow('20');
    await store.remove(entry.id);
    await expect(tutor.ask({ analysis, entryId: entry.id, history: [], question: 'why?' })).rejects.toThrow('不存在');
    expect(answer).not.toHaveBeenCalled();
  });
  it('serializes questions on the same entry and releases the guard after a provider error', async () => {
    let reject!: (error: Error) => void;
    const answer = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
      .mockResolvedValueOnce('重试成功。');
    const tutor = new TutorService(store, answer);
    const request = { analysis, entryId: entry.id, history: [], question: 'why?' };
    const first = tutor.ask(request);
    await expect(tutor.ask(request)).rejects.toThrow('还在处理中');
    reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect(store.list()[0].conversation).toBeUndefined();
    await expect(tutor.ask(request)).resolves.toMatchObject({ answer: '重试成功。' });
    expect(store.list()[0].conversation).toHaveLength(1);
  });
  it('does not recreate an entry deleted while an answer is in flight', async () => {
    let finish!: (answer: string) => void;
    const tutor = new TutorService(store, vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    const request = tutor.ask({ analysis, entryId: entry.id, history: [], question: 'why?' });
    await store.remove(entry.id);
    finish('迟到的回答');
    await expect(request).rejects.toThrow('不存在');
    expect(store.list()).toEqual([]);
  });
  it('preserves all stored turns while sending only recent complete turns within the budget', async () => {
    const messages: ChatMessage[] = Array.from({ length: 8 }, (_, i) => [
      { role: 'user' as const, content: `Q${i}` + 'q'.repeat(3998) },
      { role: 'assistant' as const, content: `A${i}` + 'a'.repeat(11998) },
    ]).flat();
    expect(recentHistory(messages)).toEqual(messages.slice(-6));
    const answer = vi.fn().mockResolvedValue('最新回答');
    const tutor = new TutorService(store, answer);
    for (let i = 0; i < messages.length; i += 2)
      await store.addConversation(entry.id, messages[i].content, messages[i + 1].content);
    const result = await tutor.ask({ analysis, entryId: entry.id, history: [], question: '继续解释' });
    expect(answer.mock.calls[0][1]).toEqual(messages.slice(-6));
    expect(result.entry?.conversation).toHaveLength(9);
  });
});

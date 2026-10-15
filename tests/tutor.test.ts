import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

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
    const previous = await store.addConversation(entry.id, '从另一个窗口追问', '已保存的回答');
    const answer = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const tutor = new TutorService(store, answer);
    const request = tutor.ask({ analysis, entryId: entry.id, history: [], question: 'why?' });
    await store.remove(entry.id);
    finish('迟到的回答');
    const response = await request;
    expect(response).toMatchObject({ answer: '迟到的回答', saveError: expect.stringContaining('未能保存') });
    expect(response.entry).toBeUndefined();
    expect(response.temporaryConversation?.[0]).toEqual(previous.conversation![0]);
    expect(response.temporaryConversation?.[1]).toMatchObject({ question: 'why?', answer: '迟到的回答' });
    expect(answer).toHaveBeenCalledTimes(1);
    expect(store.list()).toEqual([]);
  });
  it('keeps a completed answer visible when local saving fails, without retrying the model', async () => {
    const answer = vi.fn().mockResolvedValue('这条回答仍然可以阅读和复制。');
    const save = vi.spyOn(store, 'addConversation').mockRejectedValueOnce(new Error('private path unavailable'));
    const tutor = new TutorService(store, answer);
    const response = await tutor.ask({ analysis, entryId: entry.id, history: [], question: '为什么？' });
    expect(response.answer).toBe('这条回答仍然可以阅读和复制。');
    expect(response.entry).toBeUndefined();
    expect(response.saveError).toContain('未能保存');
    expect(response.saveError).not.toContain('private');
    expect(answer).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.list()[0].conversation).toBeUndefined();
  });
  it('returns the full authoritative conversation when the caller is stale and saving fails', async () => {
    const previous = await store.addConversation(entry.id, '服务端新问题', '服务端新答案');
    const answer = vi.fn().mockResolvedValue('当前回答');
    const save = vi.spyOn(store, 'addConversation').mockRejectedValueOnce(new Error('disk unavailable'));
    const tutor = new TutorService(store, answer);
    const response = await tutor.ask({ analysis, entryId: entry.id, history: [], question: '当前问题' });
    expect(answer.mock.calls[0][1]).toEqual([
      { role: 'user', content: '服务端新问题' }, { role: 'assistant', content: '服务端新答案' },
    ]);
    expect(response.temporaryConversation).toHaveLength(2);
    expect(response.temporaryConversation?.[0]).toEqual(previous.conversation![0]);
    const current = response.temporaryConversation![1];
    expect(current).toMatchObject({ question: '当前问题', answer: '当前回答' });
    expect(current.id).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
    expect(Number.isFinite(Date.parse(current.createdAt))).toBe(true);
    expect(response.entry).toBeUndefined();
    expect(answer).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.list()[0].conversation).toEqual(previous.conversation);
  });
  it('passes valid images only on the current turn and saves text without image bytes', async () => {
    const images = [{ mimeType: 'image/png' as const, data: (await readFile(new URL('../assets/icon.png', import.meta.url))).toString('base64') }];
    const answer = vi.fn().mockResolvedValueOnce('The screenshot asks about the deadline. Your reply fits.').mockResolvedValueOnce('A second answer.');
    const tutor = new TutorService(store, answer);
    const first = await tutor.ask({ analysis, entryId: entry.id, history: [], question: '', images });
    const question = 'Please review my reply in the attached conversation.';
    expect(answer.mock.calls[0][4]).toEqual(images);
    expect(first.entry?.conversation?.[0]).toMatchObject({ question, answer: expect.stringContaining('screenshot') });
    const saved = await readFile(path.join(directory, 'library.json'), 'utf8');
    expect(saved).not.toContain(images[0].data);
    expect(saved).not.toContain('mimeType');
    await tutor.ask({ analysis, entryId: entry.id, history: [], question: 'Can it sound friendlier?' });
    expect(answer.mock.calls[1]).toHaveLength(4);
    expect(answer.mock.calls[1][1]).toEqual([
      { role: 'user', content: question },
      { role: 'assistant', content: 'The screenshot asks about the deadline. Your reply fits.' },
    ]);
  });
  it('rejects invalid image payloads before calling the provider or saving a turn', async () => {
    const answer = vi.fn();
    const tutor = new TutorService(store, answer);
    await expect(tutor.ask({ analysis, entryId: entry.id, history: [], question: 'Does this work?', images: [{ mimeType: 'image/png', data: 'bad' }] })).rejects.toThrow();
    expect(answer).not.toHaveBeenCalled();
    expect(store.list()[0].conversation).toBeUndefined();
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
    vi.spyOn(store, 'addConversation').mockRejectedValueOnce(new Error('write failed'));
    const temporary = await tutor.ask({ analysis, entryId: entry.id, history: [], question: '再问一句' });
    expect(temporary.temporaryConversation).toHaveLength(10);
    expect(temporary.temporaryConversation?.slice(0, 9)).toEqual(result.entry?.conversation);
    expect(temporary.temporaryConversation?.[0].question).toBe(messages[0].content);
    expect(temporary.entry).toBeUndefined();
    expect(store.list()[0].conversation).toHaveLength(9);
    expect(answer).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment happy-dom
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Analysis, AppState, Entry, ImageInput, Settings } from '../src/shared/types';
import { TutorPanel } from '../src/renderer/components';
import { Workbench } from '../src/renderer/Workbench';
import { App } from '../src/renderer/App';
import { SettingsPage } from '../src/renderer/Settings';
import { readImageFiles } from '../src/renderer/Images';

const fake = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  api: { ask: vi.fn(), analyze: vi.fn(), getState: vi.fn(), openLibrary: vi.fn(), copy: vi.fn(),
    getAppearance: vi.fn(), saveSettings: vi.fn(), testProvider: vi.fn(), onChanged: vi.fn(), minimize: vi.fn(), close: vi.fn() },
}));
vi.mock('../src/renderer/bridge', () => ({ api: fake.api, isPreview: false, errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error) }));
vi.mock('../src/renderer/i18n', async () => {
  const { createTranslator } = await import('../src/shared/i18n');
  return { useI18n: () => ({ language: 'en', t: createTranslator('en'), saving: false, error: '', setLanguage: vi.fn() }) };
});
const settings: Settings = {
  uiLanguage: 'en', provider: 'compatible', endpoint: 'https://example.invalid/v1', model: 'test-model', apiKey: '', hasApiKey: false,
  requestProtocol: 'responses', reasoningEffort: 'high', azureApiVersion: '', targetLanguage: 'English', explanationLanguage: 'English',
  grammarShortcut: 'Ctrl+Shift+G', translateShortcut: 'Ctrl+Shift+T', libraryPath: '', autoReplace: false, launchAtLogin: false, saveCorrectSentences: false,
};
const analysis: Analysis = { mode: 'grammar', original: 'I am agree.', corrected: 'I agree.', isCorrect: false, explanation: 'Agree is a verb.', issues: [], tags: [], example: '' };
const entry: Entry = { ...analysis, grammarTone: 'spoken', id: 'note-1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', sourceLanguage: 'English', targetLanguage: 'English',
  review: { dueAt: '2026-10-01T00:00:00Z', interval: 0, ease: 2.5, repetitions: 0, lastReviewedAt: null }, conversation: [] };
const state: AppState = { settings, entries: [entry], shortcuts: { grammar: true, translate: true }, version: 'test' };
const png = readFileSync(resolve('assets/icon.png')).toString('base64');
const image: ImageInput = { mimeType: 'image/png', data: png, name: 'conversation.png' };
const noop = () => {};
const done = async () => {};
let root: Root;
let host: HTMLDivElement;
let scroll: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); fake.listeners.clear();
  fake.api.onChanged.mockImplementation((callback: () => void) => { fake.listeners.add(callback); return () => fake.listeners.delete(callback); });
  fake.api.getState.mockResolvedValue(structuredClone(state));
  fake.api.getAppearance.mockResolvedValue({ theme: 'forest', fontSize: 'large' });
  fake.api.ask.mockResolvedValue({ answer: 'A clear natural-language answer.' });
  fake.api.analyze.mockResolvedValue({ ...analysis });
  fake.api.openLibrary.mockResolvedValue(undefined);
  scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

async function render(node: Parameters<Root['render']>[0]) { await act(async () => { root.render(node); }); }
function button(text: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.includes(text));
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function select(selector: string, value: string) {
  await act(async () => { const input = host.querySelector<HTMLSelectElement>(selector)!; input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
}
function pngFile() { return new File([Uint8Array.from(atob(png), (value) => value.charCodeAt(0))], 'conversation.png', { type: 'image/png' }); }
async function pasteImage(file = pngFile()) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
  await act(async () => { host.querySelector('textarea')!.dispatchEvent(event); });
  return event;
}

describe('follow-up conversation interactions', () => {
  it('continues a saved note for two rounds while store change notifications arrive during each answer', async () => {
    const stored = structuredClone(entry);
    fake.api.getState.mockImplementation(async () => ({ ...state, entries: [structuredClone(stored)] }));
    fake.api.ask.mockImplementation(async (request) => {
      const answer = `Answer ${stored.conversation!.length + 1}`;
      stored.conversation!.push({ id: `turn-${stored.conversation!.length + 1}`, question: request.question, answer, createdAt: new Date().toISOString() });
      fake.listeners.forEach((listener) => listener());
      return { answer, entry: structuredClone(stored) };
    });
    await render(<TutorPanel analysis={analysis} entryId={entry.id} initialTurns={[]} />);
    await click('Any more questions?');
    await fill('textarea', 'First question'); await click('Send question');
    await fill('textarea', 'Second question'); await click('Send question');
    expect(fake.api.ask).toHaveBeenCalledTimes(2);
    for (const [request] of fake.api.ask.mock.calls) expect(request).toMatchObject({ entryId: entry.id, history: [] });
    expect([...host.querySelectorAll('.conversation-answer p')].map((node) => node.textContent)).toEqual(['Answer 1', 'Answer 2']);
    expect(host.textContent).not.toContain('Answer received, but not saved');
    expect(button('Send question').disabled).toBe(true);
    await fill('textarea', 'Third question'); expect(button('Send question').disabled).toBe(false);
  });

  it('keeps two natural-text rounds and sends the full unsaved history on the next round', async () => {
    fake.api.ask.mockResolvedValueOnce({ answer: 'Use **agree** as a verb.\n\n<script>literal</script>' }).mockResolvedValueOnce({ answer: 'Yes, “I agree” works in conversation too.' });
    await render(<TutorPanel analysis={analysis} initialTurns={[]} />);
    await click('Any more questions?');
    await fill('textarea', 'Why no am?'); await click('Send question');
    expect(host.textContent).toContain('Use **agree** as a verb.');
    expect(host.querySelector('script')).toBeNull();
    await fill('textarea', 'Is this natural in conversation?'); await click('Send question');
    expect(fake.api.ask).toHaveBeenNthCalledWith(2, expect.objectContaining({ question: 'Is this natural in conversation?', history: [
      { role: 'user', content: 'Why no am?' }, { role: 'assistant', content: 'Use **agree** as a verb.\n\n<script>literal</script>' },
    ] }));
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(2);
    expect(host.textContent).toContain('2 / 20 turns');
  });

  it('preserves a generated answer after a save failure and continues locally despite store-change events', async () => {
    fake.api.ask.mockResolvedValueOnce({ answer: 'Keep this answer.', saveError: 'Disk unavailable.' }).mockResolvedValueOnce({ answer: 'I remember the earlier answer.' });
    await render(<TutorPanel analysis={analysis} entryId={entry.id} initialTurns={[]} />);
    await click('Any more questions?'); await fill('textarea', 'Please explain.'); await click('Send question');
    expect(host.textContent).toContain('Answer received, but not saved');
    expect(host.textContent).toContain('Keep this answer.');
    const reads = fake.api.getState.mock.calls.length;
    await act(async () => fake.listeners.forEach((listener) => listener()));
    expect(fake.api.getState).toHaveBeenCalledTimes(reads);
    await fill('textarea', 'Can you expand on that?'); await click('Send question');
    expect(fake.api.ask).toHaveBeenNthCalledWith(2, expect.objectContaining({ entryId: undefined, history: [
      { role: 'user', content: 'Please explain.' }, { role: 'assistant', content: 'Keep this answer.' },
    ] }));
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(2);
    expect(host.textContent).toContain('Further questions use the full context, but the conversation is temporary.');
    expect(host.textContent).toContain('Switching tasks, closing the result or analyzing again clears it.');
  });

  it('uses the authoritative conversation returned on a save failure, including a server-only prior turn', async () => {
    const prior = { id: 'server-only', question: 'An earlier server-side question.', answer: 'An earlier server-side answer.', createdAt: '2026-10-02T00:00:00Z' };
    const latest = { id: 'unsaved-answer', question: 'Please explain.', answer: 'Keep this answer too.', createdAt: '2026-10-02T00:00:01Z' };
    fake.api.ask.mockResolvedValueOnce({ answer: latest.answer, saveError: 'Disk unavailable.', temporaryConversation: [prior, latest] }).mockResolvedValueOnce({ answer: 'Both earlier answers remain in context.' });
    await render(<TutorPanel analysis={analysis} entryId={entry.id} initialTurns={[]} />);
    await click('Any more questions?'); await fill('textarea', latest.question); await click('Send question');
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(2);
    expect(host.textContent).toContain(prior.answer);
    expect(host.textContent).toContain(latest.answer);
    await fill('textarea', 'Please connect both ideas.'); await click('Send question');
    expect(fake.api.ask).toHaveBeenNthCalledWith(2, expect.objectContaining({ entryId: undefined, history: [
      { role: 'user', content: prior.question }, { role: 'assistant', content: prior.answer },
      { role: 'user', content: latest.question }, { role: 'assistant', content: latest.answer },
    ] }));
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(3);
  });

  it('retains a failed question for retry and does not append a phantom conversation turn', async () => {
    fake.api.ask.mockRejectedValueOnce(new Error('Temporary connection failure.')).mockResolvedValueOnce({ answer: 'Retry succeeded.' });
    await render(<TutorPanel analysis={analysis} initialTurns={[]} />); await click('Any more questions?');
    await fill('textarea', 'Keep this question.'); await click('Send question');
    expect(host.querySelector('textarea')!.value).toBe('Keep this question.');
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(0);
    await click('Retry question');
    expect(fake.api.ask).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Keep this question.', history: [] }));
    expect(host.textContent).toContain('Retry succeeded.');
  });

  it('ignores an older history response after a newer refresh has completed', async () => {
    let resolveOld!: (state: AppState) => void;
    fake.api.getState.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await render(<TutorPanel analysis={analysis} entryId={entry.id} initialTurns={[]} />);
    await click('Any more questions?');
    const recent = { id: 'latest', question: 'Newer question', answer: 'Newer answer', createdAt: new Date().toISOString() };
    fake.api.getState.mockResolvedValue({ ...state, entries: [{ ...entry, conversation: [recent] }] });
    await act(async () => fake.listeners.forEach((listener) => listener()));
    expect(host.textContent).toContain('Newer answer');
    await act(async () => resolveOld(structuredClone(state)));
    expect(host.textContent).toContain('Newer answer');
    expect(host.querySelectorAll('.conversation-turn')).toHaveLength(1);
  });

  it('includes visible original images, accepts image-only follow-ups, and lets users remove them', async () => {
    await render(<TutorPanel analysis={{ ...analysis, mode: 'reply' }} initialTurns={[]} contextImages={[image]} />);
    await click('Any more questions?');
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(1);
    await click('Send question');
    expect(fake.api.ask).toHaveBeenCalledWith(expect.objectContaining({ question: 'Please review my reply in the attached conversation.', images: [image] }));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove image 1"]')!.click());
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(0);
    expect(button('Send question').disabled).toBe(true);
  });
});

describe('practice images and navigation', () => {
  it('pastes a screenshot into text practice, preserves the draft, previews/removes it, and only sends on submit', async () => {
    await render(<Workbench settings={settings} notify={noop} onSettings={noop} initial={null} onDone={done} />);
    await fill('#sentence-input', 'The blue bubble is my answer.');
    const event = await pasteImage();
    expect(event.defaultPrevented).toBe(true);
    expect(host.querySelector('#writing-reply')!.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector<HTMLTextAreaElement>('#sentence-input')!.value).toBe('The blue bubble is my answer.');
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(1);
    expect(fake.api.analyze).not.toHaveBeenCalled();
    await select('.grammar-tone select', 'spoken'); await click('Review my reply');
    expect(fake.api.analyze).toHaveBeenCalledWith('The blue bubble is my answer.', 'reply', expect.objectContaining({ grammarTone: 'spoken', images: [image] }));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove image 1"]')!.click());
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(0);
    expect(button('Review my reply').disabled).toBe(true);
    await click('Check text');
    expect(host.querySelector<HTMLTextAreaElement>('#sentence-input')!.value).toBe('The blue bubble is my answer.');
  });

  it('rejects invalid image data without switching modes, losing text, or sending a request', async () => {
    await render(<Workbench settings={settings} notify={noop} onSettings={noop} initial={null} onDone={done} />);
    await fill('#sentence-input', 'Keep this draft.');
    await pasteImage(new File(['<svg><script>bad</script></svg>'], 'fake.png', { type: 'image/png' }));
    expect(host.textContent).toContain('Cannot read this image.');
    expect(host.querySelector('#writing-grammar')!.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector<HTMLTextAreaElement>('#sentence-input')!.value).toBe('Keep this draft.');
    expect(fake.api.analyze).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(0);
  });

  it('discards a late file read when a different practice item was opened meanwhile', async () => {
    let finish!: (bytes: ArrayBuffer) => void;
    const file = pngFile();
    const data = await file.arrayBuffer();
    vi.spyOn(file, 'arrayBuffer').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(<Workbench settings={settings} notify={noop} onSettings={noop} initial={null} onDone={done} />);
    await pasteImage(file);
    await render(<Workbench settings={settings} notify={noop} onSettings={noop} initial={{ text: 'A different note.', mode: 'grammar', key: 9 }} onDone={done} />);
    await act(async () => finish(data));
    expect(host.querySelector<HTMLTextAreaElement>('#sentence-input')!.value).toBe('A different note.');
    expect(host.querySelector('#writing-grammar')!.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelectorAll('.image-preview img')).toHaveLength(0);
  });

  it('focuses and scrolls to the composer when a recent card is clicked on the same page', async () => {
    await render(<App />);
    expect(host.querySelector('.recent-card')).not.toBeNull();
    scroll.mockClear();
    await act(async () => host.querySelector<HTMLButtonElement>('.recent-card')!.click());
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(host.querySelector('#sentence-input'));
    expect(host.querySelector<HTMLTextAreaElement>('#sentence-input')!.value).toBe(entry.original);
    expect(host.querySelector<HTMLSelectElement>('.grammar-tone select')!.value).toBe('spoken');
    scroll.mockClear();
    await act(async () => host.querySelector<HTMLButtonElement>('.recent-card')!.click());
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('shows folder-opening progress, blocks duplicates and makes a failure visible', async () => {
    let reject!: (error: Error) => void;
    fake.api.openLibrary.mockImplementation(() => new Promise((_resolve, failure) => { reject = failure; }));
    await render(<App />); await click('Open notes folder');
    expect(button('Opening…').disabled).toBe(true);
    await click('Opening…'); expect(fake.api.openLibrary).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('Folder unavailable.')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Folder unavailable.');
    expect(button('Open notes folder').disabled).toBe(false);
  });

  it('resets effort when changing providers and sends the selected effort in connection testing', async () => {
    await render(<SettingsPage settings={settings} initialDraft={null} onDraft={noop} shortcuts={{ grammar: true, translate: true }} notify={noop} onSaved={noop} refresh={done} />);
    const effort = [...host.querySelectorAll<HTMLSelectElement>('select')].find((node) => node.closest('label')?.textContent?.includes('Reasoning effort'))!;
    expect(effort.value).toBe('high');
    await click('Anthropic'); expect(effort.disabled).toBe(true); expect(effort.value).toBe('default');
    await click('OpenAI'); expect(effort.disabled).toBe(false);
    await act(async () => { effort.value = 'xhigh'; effort.dispatchEvent(new Event('change', { bubbles: true })); });
    await click('Test connection');
    expect(fake.api.testProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', reasoningEffort: 'xhigh' }));
  });
});

describe('attachment batch limits', () => {
  it('bounds display filenames to the API limit without changing the original file', async () => {
    const name = `${'a'.repeat(240)}.png`;
    const file = new File([await pngFile().arrayBuffer()], name, { type: 'image/png' });
    const attached = await readImageFiles([file]);
    expect(attached[0].name).toBe(name.slice(0, 200));
    expect(file.name).toBe(name);
    expect(attached[0].data).toBe(png);
  });
  it('rejects an entire over-limit batch instead of retaining only some images', async () => {
    await expect(readImageFiles([pngFile(), pngFile()], [image, image, image])).rejects.toMatchObject({ code: 'count' });
  });
  it('rejects oversized single images and combined payloads before reading them', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await expect(readImageFiles([big])).rejects.toMatchObject({ code: 'size' });
    const fourMiB = new File([new Uint8Array(4 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    await expect(readImageFiles([fourMiB, fourMiB, fourMiB, pngFile()])).rejects.toMatchObject({ code: 'total' });
  });
});

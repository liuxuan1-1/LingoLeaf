import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { analysisSchema, askQuestion } from './providers';
import type { LibraryStore } from './store';
import type { ChatMessage, TutorResponse } from '../shared/types';
import { validateImages } from './images';

const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ role: z.literal('assistant'), content: z.string().trim().min(1).max(12000) }).strict(),
]);
const requestSchema = z.object({
  analysis: z.unknown(),
  entryId: z.string().uuid().optional(),
  history: z.array(messageSchema).max(40),
  question: z.string().trim().max(4000, '问题最多 4,000 个字符。'),
  images: z.unknown().optional(),
}).strict();

/** Keep whole recent turns, without truncating a question or its answer. */
export function recentHistory(messages: ChatMessage[]): ChatMessage[] {
  let start = messages.length;
  let length = 0;
  for (let i = messages.length - 2; i >= 0; i -= 2) {
    const size = messages[i].content.length + messages[i + 1].content.length;
    if (length + size > 48000) break;
    length += size;
    start = i;
  }
  return messages.slice(start);
}

export class TutorService {
  private readonly active = new Set<string>();
  constructor(
    private readonly store: Pick<LibraryStore, 'list' | 'getProviderSettings' | 'addConversation' | 'getSyncError'>,
    private readonly answerQuestion: typeof askQuestion = askQuestion,
  ) {}

  async ask(value: unknown): Promise<TutorResponse> {
    const request = requestSchema.parse(value);
    const images = validateImages(request.images);
    const question = request.question || (images.length ? 'Please review my reply in the attached conversation.' : '');
    if (!question) throw new Error('请输入想追问的问题。');
    const key = request.entryId ?? 'temporary';
    if (this.active.has(key)) throw new Error('这个结果的上一条追问还在处理中，请稍候。');
    this.active.add(key);
    try {
      const entry = request.entryId
        ? this.store.list().find((item) => item.id === request.entryId)
        : undefined;
      if (request.entryId && !entry) throw new Error('这个学习条目已不存在，请重新打开学习库。');
      // Saved records are authoritative; renderer-supplied history cannot replace them.
      const analysis = analysisSchema.strip().parse(entry ?? request.analysis);
      const history: ChatMessage[] = entry
        ? (entry.conversation ?? []).flatMap((turn) => [
            { role: 'user' as const, content: turn.question },
            { role: 'assistant' as const, content: turn.answer },
          ])
        : request.history;
      if (history.length % 2 || history.some((item, i) => item.role !== (i % 2 ? 'assistant' : 'user')))
        throw new Error('对话历史不完整，请重新打开这条结果。');
      if (history.length >= 40) throw new Error('每条结果最多追问 20 轮，可以重新练习开始新的对话。');
      const settings = this.store.getProviderSettings();
      const answer = images.length
        ? await this.answerQuestion(analysis, recentHistory(history), question, settings, images)
        : await this.answerQuestion(analysis, recentHistory(history), question, settings);
      if (!entry) return { answer };
      try {
        const updated = await this.store.addConversation(entry.id, question, answer);
        return { answer, entry: updated, syncError: this.store.getSyncError() };
      } catch {
        // A completed model response must remain visible even if its entry was
        // deleted, or the local disk became unavailable while it was in flight.
        return {
          answer,
          saveError: '回答已生成，但未能保存到学习库。请复制保留；继续追问仅保留在当前窗口。',
          // The calling window may have stale history. Preserve the complete
          // authoritative snapshot, not just the recent model context window.
          temporaryConversation: [
            ...(entry.conversation ?? []),
            { id: randomUUID(), question, answer, createdAt: new Date().toISOString() },
          ],
        };
      }
    } finally {
      this.active.delete(key);
    }
  }
}

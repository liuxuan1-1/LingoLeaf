import { z } from 'zod';
import { analysisSchema, askQuestion } from './providers';
import type { LibraryStore } from './store';
import type { ChatMessage, TutorResponse } from '../shared/types';

const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ role: z.literal('assistant'), content: z.string().trim().min(1).max(12000) }).strict(),
]);
const requestSchema = z.object({
  analysis: z.unknown(),
  entryId: z.string().uuid().optional(),
  history: z.array(messageSchema).max(40),
  question: z.string().trim().min(1, '请输入想追问的问题。').max(4000, '问题最多 4,000 个字符。'),
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
      const answer = await this.answerQuestion(analysis, recentHistory(history), request.question, settings);
      const updated = entry
        ? await this.store.addConversation(entry.id, request.question, answer)
        : undefined;
      return { answer, entry: updated, syncError: updated ? this.store.getSyncError() : undefined };
    } finally {
      this.active.delete(key);
    }
  }
}

import { BookOpen, Languages, MessageCircle, WandSparkles } from 'lucide-react';
import type { Entry, Mode } from '../shared/types';

export const MODE_INFO = {
  grammar: { label: '语法纠错', note: '语法笔记', short: '语法', icon: WandSparkles },
  translate: { label: '翻译表达', note: '翻译笔记', short: '翻译', icon: Languages },
  read: { label: '阅读解析', note: '阅读笔记', short: '阅读', icon: BookOpen },
  express: { label: '帮我表达', note: '表达笔记', short: '表达', icon: MessageCircle },
} satisfies Record<Mode, { label: string; note: string; short: string; icon: typeof BookOpen }>;

export const MODES = Object.keys(MODE_INFO) as Mode[];

export function entrySearchText(entry: Entry): string {
  return [
    entry.original,
    entry.corrected,
    entry.translation || '',
    entry.explanation,
    entry.expressionContext || '',
    entry.expressionTone || '',
    ...entry.tags,
    ...entry.issues.flatMap((issue) => [issue.rule, issue.explanation]),
    ...(entry.grammarPoints || []).flatMap((point) => [point.text, point.explanation]),
    ...(entry.keyPoints || []),
    ...(entry.alternatives || []).flatMap((item) => [item.text, item.tone, item.explanation]),
    ...(entry.clarificationQuestions || []),
    ...(entry.conversation || []).flatMap((turn) => [turn.question, turn.answer]),
  ].join(' ').toLowerCase();
}

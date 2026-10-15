import { BookOpen, Image, Languages, MessageCircle, WandSparkles } from 'lucide-react';
import type { Entry, GrammarTone, Mode, UiLanguage } from '../shared/types';
import { createTranslator, type Translate } from '../shared/i18n';

export const MODE_INFO = {
  grammar: { label: '语法纠错', note: '语法笔记', short: '语法', icon: WandSparkles },
  translate: { label: '翻译表达', note: '翻译笔记', short: '翻译', icon: Languages },
  read: { label: '阅读解析', note: '阅读笔记', short: '阅读', icon: BookOpen },
  express: { label: '帮我表达', note: '表达笔记', short: '表达', icon: MessageCircle },
  reply: { label: '截图回复', note: '回复笔记', short: '回复', icon: Image },
} satisfies Record<Mode, { label: string; note: string; short: string; icon: typeof BookOpen }>;

export const MODES = Object.keys(MODE_INFO) as Mode[];

export function getModeInfo(language: UiLanguage) {
  const t = createTranslator(language);
  return {
    grammar: { label: t('语法纠错', 'Grammar check'), note: t('语法笔记', 'Grammar note'), short: t('语法', 'Grammar'), icon: WandSparkles },
    translate: { label: t('翻译原文', 'Translate a text'), note: t('翻译笔记', 'Translation note'), short: t('翻译', 'Translation'), icon: Languages },
    read: { label: t('阅读解析', 'Reading analysis'), note: t('阅读笔记', 'Reading note'), short: t('阅读', 'Reading'), icon: BookOpen },
    express: { label: t('组织想法', 'Shape an idea'), note: t('表达笔记', 'Expression note'), short: t('表达', 'Expression'), icon: MessageCircle },
    reply: { label: t('截图回复', 'Screenshot reply'), note: t('回复笔记', 'Reply note'), short: t('回复', 'Reply'), icon: Image },
  } satisfies typeof MODE_INFO;
}

export function getGrammarTones(t: Translate): Record<GrammarTone, string> {
  return {
    professional: t('专业沟通', 'Professional'), spoken: t('口语／演讲稿', 'Spoken / presentation'),
    casual: t('轻松日常', 'Casual'), formal: t('正式书面', 'Formal'), neutral: t('自然中性', 'Neutral'),
  };
}

export function getToneRewriteTitle(t: Translate, tone: GrammarTone = 'professional'): string {
  return {
    professional: t('更正式／专业的表达', 'A more professional expression'),
    spoken: t('更适合说出来的表达', 'A more natural spoken version'),
    casual: t('更轻松日常的表达', 'A more casual version'),
    formal: t('更正式的书面表达', 'A more formal written version'),
    neutral: t('更自然中性的表达', 'A more natural, neutral version'),
  }[tone];
}

export function entrySearchText(entry: Entry): string {
  return [
    entry.original,
    entry.corrected,
    entry.translation || '',
    entry.professional?.text || '',
    entry.professional?.explanation || '',
    ...(entry.professional?.improvements || []),
    entry.explanation,
    entry.expressionContext || '',
    entry.expressionTone || '',
    entry.replyReview?.question || '', entry.replyReview?.reply || '', entry.replyReview?.explanation || '', entry.replyReview?.uncertainty || '',
    ...(entry.replyReview?.points || []),
    ...entry.tags,
    ...entry.issues.flatMap((issue) => [issue.rule, issue.explanation]),
    ...(entry.grammarPoints || []).flatMap((point) => [point.text, point.explanation]),
    ...(entry.keyPoints || []),
    ...(entry.alternatives || []).flatMap((item) => [item.text, item.tone, item.explanation]),
    ...(entry.clarificationQuestions || []),
    ...(entry.conversation || []).flatMap((turn) => [turn.question, turn.answer]),
  ].join(' ').toLowerCase();
}

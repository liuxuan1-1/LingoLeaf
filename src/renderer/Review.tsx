import { useI18n } from './i18n';
import { ArrowRight, BookOpenCheck, Check, Eye, Flower2, RotateCcw, Sprout } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, Mode, Rating } from '../shared/types';
import { api, errorMessage } from './bridge';
import { EmptyState, ResultView, SectionHeading, type Notify } from './components';

export function ReviewPage({
  entries,
  notify,
  updateEntry,
  onPractice,
  now,
}: {
  entries: Entry[];
  notify: Notify;
  updateEntry: (entry: Entry) => void;
  onPractice: () => void;
  now: number;
}) {
  const { language, t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const queue = useMemo(
    () =>
      entries
        .filter((entry) => new Date(entry.review.dueAt).getTime() <= now)
        .sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt)),
    [entries, now],
  );
  const current = queue[0];
  const prompts = {
    grammar: { label: t("找到语法问题，试着修改", "Find the grammar issue and try to fix it"), hint: t("哪里需要修改？为什么？在心里先说出你的答案。", "What needs changing, and why? Think of your answer first.") },
    translate: { label: t('试着翻译为 {language}', 'Try translating into {language}', { language: current?.targetLanguage || '' }), hint: t("不急着看答案，先用目标语言完整表达一次。", "Before looking, try expressing the whole sentence in the target language.") },
    read: { label: t("回想句意、语法结构与要点", "Recall the meaning, structure and key points"), hint: t("这段话在说什么？试着解释句子结构，再总结它的要点。", "What does the text mean? Explain the structure and summarize its main points.") },
    express: { label: t("回想怎样自然地表达这个意思", "Recall a natural way to express this idea"), hint: t("结合原来的场景与语气，先组织一种自然的说法。", "Use the original context and tone to form a natural expression.") },
  } satisfies Record<Mode, { label: string; hint: string }>;
  const upcoming = [...entries]
    .filter((entry) => new Date(entry.review.dueAt).getTime() > Date.now())
    .sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt))[0];
  useEffect(() => setRevealed(false), [current?.id]);
  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || busy || !revealed) return;
      setBusy(true);
      try {
        const entry = await api.review(current.id, rating);
        updateEntry(entry);
        setReviewed((value) => value + 1);
        setRevealed(false);
      } catch (e) {
        notify(errorMessage(e), 'error');
      } finally {
        setBusy(false);
      }
    },
    [current, busy, revealed, notify, updateEntry],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.code === 'Space' && current && !revealed) {
        event.preventDefault();
        setRevealed(true);
      }
      if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        void rate((['again', 'hard', 'good', 'easy'] as Rating[])[Number(event.key) - 1]);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [current, revealed, rate]);
  return (
    <>
      <SectionHeading
        eyebrow={t("温习一点，记得更久", "A LITTLE RECALL GOES A LONG WAY")}
        title={t("温故，才能知新。", "Recall today. Remember tomorrow.")}
        description={t("先试着回想，再揭晓答案。按照你的掌握程度，安排下一次相见。", "Recall first, then reveal the answer. Your confidence sets the next review.")}
        action={
          <span className="review-total">
            <Flower2 size={18} />
            {t('本次已温习 {count} 句', 'Reviewed this session: {count}', { count: reviewed })}
          </span>
        }
      />
      {current ? (
        <div className="review-layout">
          <div className="review-main">
            <div className="review-progress">
              <span>{t("现在，专心这一句", "Focus on this sentence")}</span>
              <span>
                {t('剩余 {count} 句', '{count} remaining', { count: queue.length })}
              </span>
            </div>
            <div className="review-progress-track">
              <span
                style={{ width: `${Math.max(3, (reviewed / (reviewed + queue.length)) * 100)}%` }}
              />
            </div>
            <article className="review-card">
              <div className="review-card-top">
                <span className="tag">
                  {prompts[current.mode].label}
                </span>
                <span className="eyebrow">{t("主动回想", "ACTIVE RECALL")}</span>
              </div>
              <div className="recall-sentence">
                <span className="quote-mark">“</span>
                <p
                  className={`text-content${/[\r\n]/.test(current.original) ? ' text-multiline' : ''}`}
                >
                  {current.original}
                </p>
              </div>
              {revealed ? (
                <div className="revealed-answer">
                  <ResultView result={current} notify={notify} />
                </div>
              ) : (
                <div className="reveal-prompt">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <p>
                    {prompts[current.mode].hint}
                  </p>
                  <button className="button primary" onClick={() => setRevealed(true)}>
                    <Eye size={17} />
                    {t("看看答案", "Reveal answer")}<kbd>Space</kbd>
                  </button>
                </div>
              )}
            </article>
            {revealed && (
              <div className="rating-panel">
                <div>
                  <strong>{t("刚才，你回想得怎么样？", "How well did you remember?")}</strong>
                  <span>{t("如实选择，比答对更有帮助。", "An honest rating helps more than a perfect answer.")}</span>
                </div>
                <div className="rating-grid">
                  {[
                    { id: 'again', title: t("还没记住", "Again"), hint: t("再巩固一下", "Needs another look"), color: 'again' },
                    { id: 'hard', title: t("有些费力", "Hard"), hint: t("需要多练习", "More practice needed"), color: 'hard' },
                    { id: 'good', title: t("记得不错", "Good"), hint: t("基本掌握了", "Mostly remembered"), color: 'good' },
                    { id: 'easy', title: t("轻松想起", "Easy"), hint: t("已经很熟悉", "Very familiar"), color: 'easy' },
                  ].map((rating, index) => (
                    <button
                      key={rating.id}
                      disabled={busy}
                      className={`rating-button ${rating.color}`}
                      onClick={() => rate(rating.id as Rating)}
                    >
                      <kbd>{index + 1}</kbd>
                      <strong>{rating.title}</strong>
                      <span>{rating.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside className="review-aside">
            <div className="review-illustration">
              <Sprout size={69} strokeWidth={1} />
              <div className="illustration-ground" />
            </div>
            <span className="eyebrow">{t("让知识扎根", "LET IT TAKE ROOT")}</span>
            <h2>
              {t("学过，", "Learn it,")}
              <br />
              {t("也要记得。", "then remember it.")}
            </h2>
            <p>{t("比起重复阅读，主动回想更能帮助你理解和记住表达。", "Active recall helps you understand and remember expressions more than rereading alone.")}</p>
            <div className="review-tip">
              <span>{t("一个小建议", "A small tip")}</span>
              <p>{t("看完修改后，再用同一个语法规则，造一个关于自己的句子。", "After reading a correction, use the same grammar rule in a sentence about yourself.")}</p>
            </div>
            <small>
              {t("复习时间会根据你的反馈调整。", "Your feedback adjusts your review schedule.")}
              <br />
              {t("今天的每一点练习，都算数。", "Every bit of practice counts.")}
            </small>
          </aside>
        </div>
      ) : (
        <div className="card review-complete">
          <EmptyState
            icon={reviewed ? <Check size={35} /> : <BookOpenCheck size={35} strokeWidth={1.4} />}
            title={
              reviewed
                ? t("今天的积累，又扎实了一点。", "Your learning is a little stronger today.")
                : entries.length
                  ? t("此刻，没有等待复习的句子。", "No sentences are due right now.")
                  : t("先积累，再温习。", "Collect first, then review.")
            }
            description={
              reviewed
                ? t('本次温习了 {count} 句表达。下一次复习时间，已经根据你的反馈安排好了。', 'You reviewed {count} sentences. Your next reviews are scheduled based on your ratings.', { count: reviewed })
                : entries.length
                  ? upcoming
                    ? t('下一次复习：{date}。现在可以去积累一些新的表达。', 'Next review: {date}. You can learn some new expressions in the meantime.', { date: new Date(upcoming.review.dueAt).toLocaleString(language, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
                    : t("新的笔记会自动加入复习计划。", "New notes are automatically added to your review schedule.")
                  : t("你的语法纠错和翻译笔记，会自动进入复习计划。从一句你真正想说的话开始。", "Your learning notes automatically enter the review schedule. Start with something you really want to say.")
            }
            action={
              <button className="button primary" onClick={onPractice}>
                {t("再学一句", "Practice another sentence")}
                <ArrowRight size={16} />
              </button>
            }
          />
          <span className="review-complete-footer">{t("慢慢积累，自然掌握。", "Slowly, steadily, naturally.")}</span>
        </div>
      )}
    </>
  );
}

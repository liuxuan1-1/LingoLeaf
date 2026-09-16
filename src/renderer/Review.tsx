import { ArrowRight, BookOpenCheck, Check, Eye, Flower2, RotateCcw, Sprout } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, Rating } from '../shared/types';
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
        eyebrow="A LITTLE RECALL GOES A LONG WAY"
        title="温故，才能知新。"
        description="先试着回想，再揭晓答案。按照你的掌握程度，安排下一次相见。"
        action={
          <span className="review-total">
            <Flower2 size={18} />
            本次已温习 <strong>{reviewed}</strong> 句
          </span>
        }
      />
      {current ? (
        <div className="review-layout">
          <div className="review-main">
            <div className="review-progress">
              <span>现在，专心这一句</span>
              <span>
                剩余 <strong>{queue.length}</strong> 句
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
                  {current.mode === 'translate'
                    ? `试着翻译为 ${current.targetLanguage}`
                    : '找到语法问题，试着修改'}
                </span>
                <span className="eyebrow">ACTIVE RECALL</span>
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
                    {current.mode === 'grammar'
                      ? '哪里需要修改？为什么？在心里先说出你的答案。'
                      : '不急着看答案，先用目标语言完整表达一次。'}
                  </p>
                  <button className="button primary" onClick={() => setRevealed(true)}>
                    <Eye size={17} />
                    看看答案<kbd>Space</kbd>
                  </button>
                </div>
              )}
            </article>
            {revealed && (
              <div className="rating-panel">
                <div>
                  <strong>刚才，你回想得怎么样？</strong>
                  <span>如实选择，比答对更有帮助。</span>
                </div>
                <div className="rating-grid">
                  {[
                    { id: 'again', title: '还没记住', hint: '再巩固一下', color: 'again' },
                    { id: 'hard', title: '有些费力', hint: '需要多练习', color: 'hard' },
                    { id: 'good', title: '记得不错', hint: '基本掌握了', color: 'good' },
                    { id: 'easy', title: '轻松想起', hint: '已经很熟悉', color: 'easy' },
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
            <span className="eyebrow">LET IT TAKE ROOT</span>
            <h2>
              学过，
              <br />
              也要记得。
            </h2>
            <p>比起重复阅读，主动回想更能帮助你理解和记住表达。</p>
            <div className="review-tip">
              <span>一个小建议</span>
              <p>看完修改后，再用同一个语法规则，造一个关于自己的句子。</p>
            </div>
            <small>
              复习时间会根据你的反馈调整。
              <br />
              今天的每一点练习，都算数。
            </small>
          </aside>
        </div>
      ) : (
        <div className="card review-complete">
          <EmptyState
            icon={reviewed ? <Check size={35} /> : <BookOpenCheck size={35} strokeWidth={1.4} />}
            title={
              reviewed
                ? '今天的积累，又扎实了一点。'
                : entries.length
                  ? '此刻，没有等待复习的句子。'
                  : '先积累，再温习。'
            }
            description={
              reviewed
                ? `本次温习了 ${reviewed} 句表达。下一次复习时间，已经根据你的反馈安排好了。`
                : entries.length
                  ? upcoming
                    ? `下一次复习：${new Date(upcoming.review.dueAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}。现在可以去积累一些新的表达。`
                    : '新的笔记会自动加入复习计划。'
                  : '你的语法纠错和翻译笔记，会自动进入复习计划。从一句你真正想说的话开始。'
            }
            action={
              <button className="button primary" onClick={onPractice}>
                再学一句
                <ArrowRight size={16} />
              </button>
            }
          />
          <span className="review-complete-footer">Slowly, steadily, naturally.</span>
        </div>
      )}
    </>
  );
}

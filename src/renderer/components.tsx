import { Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Copy, Leaf, LoaderCircle, MessageCircle, Minus, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Analysis, ChatMessage, ConversationTurn, Entry, Mode } from '../shared/types';
import { api, errorMessage } from './bridge';
import { MODE_INFO } from './modes';
import { useI18n } from './i18n';

export type Notify = (message: string, kind?: 'success' | 'error') => void;
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-icon">
        <Leaf size={compact ? 21 : 26} strokeWidth={1.7} />
      </span>
      <div>
        <strong>
          LingoLeaf<span>.</span>
        </strong>
        {!compact && <small>{t('一点积累，自然生长', 'A little progress, every day')}</small>}
      </div>
    </div>
  );
}
export function TitleBar({ popup = false }: { popup?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`titlebar ${popup ? 'popup-titlebar' : ''}`}>
      <span>{popup ? <Brand compact /> : t('LINGOLEAF / 每天进步一点', 'LINGOLEAF / A LITTLE, EVERY DAY')}</span>
      <div className="window-controls">
        <button aria-label={t('最小化', 'Minimize')} title={t('最小化', 'Minimize')} onClick={api.minimize}>
          <Minus size={15} />
        </button>
        <button
          aria-label={popup ? t('关闭弹窗', 'Close popup') : t('隐藏到系统托盘', 'Hide to system tray')}
          title={popup ? t('关闭弹窗', 'Close popup') : t('隐藏到系统托盘，快捷键继续工作', 'Hide to system tray; shortcuts remain active')}
          className="window-close"
          onClick={api.close}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span className="loading-inline">
      <LoaderCircle size={17} className="spin" />
      {label ?? t('正在处理', 'Working')}
    </span>
  );
}
export function Shortcut({ value }: { value: string }) {
  return (
    <span className="shortcut">
      {value
        .replaceAll('CommandOrControl', 'Ctrl')
        .replaceAll('Control', 'Ctrl')
        .replaceAll('Meta', 'Win')
        .split('+')
        .map((key, i) => (
          <kbd key={i}>{key}</kbd>
        ))}
    </span>
  );
}
export function CopyButton({
  text,
  notify,
  label,
}: {
  text: string;
  notify?: Notify;
  label?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button subtle small"
      onClick={async () => {
        try {
          await api.copy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch (e) {
          notify?.(errorMessage(e), 'error');
        }
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? t('已复制', 'Copied') : label ?? t('复制', 'Copy')}
    </button>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ResultView({
  result,
  notify,
  compact = false,
  entryId,
}: {
  result: Analysis;
  notify?: Notify;
  compact?: boolean;
  entryId?: string;
}) {
  const { t } = useI18n();
  const saved = result as Partial<Entry>;
  const savedId = entryId || saved.id;
  const grammarIssues = result.issues.filter((issue) => issue.kind === 'grammar');
  const content = {
    grammar: {
      title: result.isCorrect ? t('这句话，语法没有错误', 'This sentence is grammatically correct')
        : grammarIssues.length ? t('发现 {count} 处可以改进的语法', '{count} grammar corrections to learn from', { count: grammarIssues.length })
        : t('这句话的语法需要调整', 'This sentence needs a grammar adjustment'),
      caption: result.isCorrect ? t('语法检查通过', 'LOOKING GOOD') : t('理解这次修改', 'A CHANCE TO GROW'),
      field: t('语法修正', 'Grammar correction'),
    },
    translate: { title: t('让表达，跨越语言', 'Let your words cross languages'), caption: t('翻译', 'TRANSLATION'), field: t('译文', 'Translation') },
    read: { title: t('读懂意思，也理解结构', 'Understand the meaning and structure'), caption: t('阅读与理解', 'READ & UNDERSTAND'), field: t('译文', 'Translation') },
    express: { title: t('为你的意思，找到合适的表达', 'Find the right words for your meaning'), caption: t('组织你的表达', 'FIND YOUR WORDS'), field: t('推荐表达', 'Suggested expression') },
  } satisfies Record<Mode, { title: string; caption: string; field: string }>;
  const current = content[result.mode];
  const StatusIcon = result.mode === 'grammar' ? CheckCheck : MODE_INFO[result.mode].icon;
  const contextKey = savedId || JSON.stringify(result);
  return (
    <div className={`result-view ${compact ? 'result-compact' : ''}`}>
      <div className="result-status">
        <span className={`result-check ${result.mode === 'grammar' && !result.isCorrect ? 'needs-work' : ''}`}>
          <StatusIcon size={20} />
        </span>
        <div>
          <h3>
            {current.title}
          </h3>
          <span>
            {current.caption}
          </span>
        </div>
      </div>
      {result.mode === 'express' && (result.expressionContext || result.expressionTone) && (
        <dl className="expression-context">
          {result.expressionContext && <><dt>{t('场景', 'Context')}</dt><dd className="text-content">{result.expressionContext}</dd></>}
          {result.expressionTone && <><dt>{t('语气', 'Tone')}</dt><dd className="text-content">{result.expressionTone}</dd></>}
        </dl>
      )}
      <div className="result-sentence">
        <div className="field-topline">
          <span>{current.field}{result.mode === 'read' && saved.targetLanguage ? ` · ${saved.targetLanguage}` : ''}</span>
          <CopyButton text={result.corrected} notify={notify} />
        </div>
        <p className="text-content" lang={result.mode === 'grammar' ? 'en' : undefined}>
          {result.corrected}
        </p>
      </div>
      {result.mode === 'grammar' && result.translation && (
        <div className="result-sentence result-translation">
          <div className="field-topline">
            <span>{t('句意', 'Meaning')}{result.translationLanguage ? ` · ${result.translationLanguage}` : ''}</span>
            <CopyButton text={result.translation} notify={notify} label={t('复制译文', 'Copy translation')} />
          </div>
          <p className="text-content">{result.translation}</p>
        </div>
      )}
      {result.explanation && (
        <p className="result-explanation text-content">{result.explanation}</p>
      )}
      {!!result.grammarPoints?.length && (
        <section className="learning-section" aria-label={t('语法解析', 'Grammar breakdown')}>
          <h4 className="section-label">{t('语法解析', 'Grammar breakdown')} <span>{result.grammarPoints.length}</span></h4>
          <ol className="grammar-point-list">
            {result.grammarPoints.map((point, index) => (
              <li key={index}>
                <blockquote className="text-content">{point.text}</blockquote>
                <p className="text-content">{point.explanation}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!!result.keyPoints?.length && (
        <section className="learning-section key-points" aria-label={t('要点摘要', 'Key points')}>
          <h4 className="section-label">{t('要点摘要', 'Key points')}</h4>
          <ul>{result.keyPoints.map((point, index) => <li className="text-content" key={index}>{point}</li>)}</ul>
        </section>
      )}
      {!!result.alternatives?.length && (
        <section className="learning-section" aria-label={t('其他表达与区别', 'Alternatives and differences')}>
          <h4 className="section-label">{t('其他表达与区别', 'Alternatives and differences')}</h4>
          <div className="expression-alternatives">
            {result.alternatives.map((alternative, index) => (
              <article className="expression-alternative" key={index}>
                <div className="field-topline">
                  <span>{alternative.tone || t('表达 {count}', 'Option {count}', { count: index + 1 })}</span>
                  <CopyButton text={alternative.text} notify={notify} label={t('复制表达', 'Copy expression')} />
                </div>
                <p className="alternative-text text-content">{alternative.text}</p>
                <p className="alternative-reason text-content">{alternative.explanation}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {!!result.clarificationQuestions?.length && (
        <section className="learning-section clarification" aria-label={t('可以补充的信息', 'Details you can add')}>
          <h4 className="section-label">{t('补充这些信息，表达会更贴切', 'Add these details for a better fit')}</h4>
          <ul>{result.clarificationQuestions.map((question, index) => <li className="text-content" key={index}>{question}</li>)}</ul>
          <p>{t('可以在下方追问中补充你的答案。', 'You can add your answers in the follow-up below.')}</p>
        </section>
      )}
      {result.issues.length > 0 && (
        <div className="issues">
          <div className="section-label">
            {t('理解每一个改变', 'Understand each change')} <span>{result.issues.length}</span>
          </div>
          {result.issues.map((issue, i) => (
            <article className="issue" key={i}>
              <div className="issue-header">
                <span className="issue-number">{String(i + 1).padStart(2, '0')}</span>
                <strong className="text-content">
                  {issue.rule || (issue.kind === 'grammar' ? t('语法修改', 'Grammar correction') : t('表达建议', 'Expression suggestion'))}
                </strong>
                <span className={`tag ${issue.kind === 'style' ? 'neutral' : 'amber'}`}>
                  {issue.kind === 'style' ? t('风格建议', 'Style suggestion') : t('语法', 'Grammar')}
                </span>
              </div>
              <div className="issue-diff">
                <del className="text-content">{issue.original || t('（省略）', '(omitted)')}</del>
                <ChevronRight size={14} />
                <ins className="text-content">{issue.replacement || t('（删除）', '(removed)')}</ins>
              </div>
              <p className="text-content">{issue.explanation}</p>
            </article>
          ))}
        </div>
      )}
      {result.mode === 'grammar' && result.professional && (
        <section className="professional-section learning-section" aria-label={t('更正式／专业的表达', 'A more professional expression')}>
          <div className="field-topline">
            <h4 className="section-label">{t('更正式／专业的表达', 'A more professional expression')}</h4>
            <CopyButton text={result.professional.text} notify={notify} label={t('复制专业表达', 'Copy professional version')} />
          </div>
          <p className="professional-caption">{t('可选的风格提升，不代表原句存在语法错误。根据对象和场景选择使用。', 'An optional style improvement, not a grammar error. Choose it when it suits your audience and context.')}</p>
          <p className="professional-text text-content" lang="en">{result.professional.text}</p>
          <p className="text-content">{result.professional.explanation}</p>
          {!!result.professional.improvements.length && <>
            <h5>{t('可以学到的表达要点', 'What you can learn from this rewrite')}</h5>
            <ul>{result.professional.improvements.map((item, index) => <li className="text-content" key={index}>{item}</li>)}</ul>
          </>}
        </section>
      )}
      {result.example && (
        <div className="example-block">
          <span className="eyebrow">{t('再看一个例句', 'TRY ANOTHER SENTENCE')}</span>
          <p className="text-content">{result.example}</p>
        </div>
      )}
      {result.tags.length > 0 && (
        <div className="tags">
          {result.tags.map((tag) => (
            <span className="tag neutral" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      <TutorPanel key={contextKey} analysis={result} entryId={savedId} initialTurns={saved.conversation || []} notify={notify} />
    </div>
  );
}

/** A panel stays inside its owning result, including the library's existing dialog. */
function TutorPanel({ analysis, entryId, initialTurns, notify }: {
  analysis: Analysis;
  entryId?: string;
  initialTurns: ConversationTurn[];
  notify?: Notify;
}) {
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>(initialTurns);
  const [question, setQuestion] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(!entryId);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [syncError, setSyncError] = useState('');
  const mounted = useRef(true);
  const submitting = useRef(false);
  const refreshAfterSend = useRef(false);
  const loadSequence = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);
  useEffect(() => {
    const list = conversationRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, turns.length, busy]);
  const loadHistory = async () => {
    if (!entryId) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const state = await api.getState();
      if (!mounted.current || sequence !== loadSequence.current) return;
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error(t('这条笔记已不存在，请重新分析原文后继续。', 'This note no longer exists. Analyze the original text again to continue.'));
      setTurns(entry.conversation || []);
      setSyncError(state.syncError || '');
      setLoaded(true);
    } catch (e) {
      if (mounted.current && sequence === loadSequence.current) {
        setLoadError(errorMessage(e));
        setLoaded(false);
      }
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (!open || !entryId) return;
    if (!submitting.current) void loadHistory();
    return api.onChanged(() => {
      if (submitting.current) { refreshAfterSend.current = true; return; }
      void loadHistory();
    });
  }, [open, entryId, language]);
  const send = async () => {
    const value = question.trim();
    if (!value || submitting.current || !loaded || loading || turns.length >= 20) return;
    submitting.current = true;
    // A response to an earlier history read must never replace this new answer.
    loadSequence.current += 1;
    refreshAfterSend.current = false;
    setBusy(true);
    setError('');
    setPendingQuestion(value);
    const history: ChatMessage[] = entryId ? [] : turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      { role: 'assistant' as const, content: turn.answer },
    ]);
    try {
      const response = await api.ask({ analysis, entryId, history, question: value });
      if (!mounted.current) return;
      if (entryId && !response.entry) throw new Error(t('回答没有保存成功，请重试。', 'The answer could not be saved. Please try again.'));
      setTurns(response.entry?.conversation || [...turns, {
        id: `local-${Date.now()}`, question: value, answer: response.answer, createdAt: new Date().toISOString(),
      }]);
      setQuestion('');
      setPendingQuestion('');
      setSyncError(response.syncError || '');
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
        setPendingQuestion('');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setBusy(false);
        if (entryId && refreshAfterSend.current) void loadHistory();
      }
    }
  };
  return (
    <section className="tutor-panel" aria-label={t('关于这条结果的追问', 'Follow up on this result')}>
      <button className="tutor-toggle" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}>
        <MessageCircle size={19} />
        <span><strong>{t('还想问问？', 'Any more questions?')}</strong><small>{t('继续理解这条结果', 'Explore this result further')}{turns.length ? ` · ${t('{count} 轮对话', '{count} conversation turns', { count: turns.length })}` : ''}</small></span>
        <ChevronDown size={18} className={open ? 'is-open' : ''} />
      </button>
      {open && <div className="tutor-content" id={panelId}>
        <p className="tutor-caption">{t('追问结合当前结果和近期对话回答。', 'Answers use this result and your recent conversation.')} {' '}
          {entryId ? t('回答会随这条学习笔记保存在本机，并同步到 Markdown。', 'Answers are saved locally with this note and synced to Markdown.') : t('这条结果未收藏，对话仅在当前页面保留；离开页面或重新分析会清空。', 'This result is not saved. The conversation lasts only while this result is open; switching tasks or analyzing again clears it.')}</p>
        {loading && <Spinner label={t('正在载入这条笔记的对话…', 'Loading this note’s conversation…')} />}
        {loadError && <div className="inline-error" role="alert"><CircleAlert size={17} /><div>
          <p>{loadError}</p><button className="text-button" onClick={() => void loadHistory()}>{t('重新载入对话', 'Reload conversation')}</button>
        </div></div>}
        {loaded && <>
          <div className="conversation-list" ref={conversationRef} aria-label={t('追问记录', 'Conversation history')} tabIndex={turns.length ? 0 : undefined} aria-live="polite" aria-relevant="additions text">
            {turns.map((turn, index) => <article className="conversation-turn" key={turn.id}>
              <div className="conversation-question"><span>{t('你', 'You')} · {index + 1}</span><p className="text-content">{turn.question}</p></div>
              <div className="conversation-answer"><div className="field-topline"><span>{t('语言助手', 'Language tutor')}</span>
                <CopyButton text={turn.answer} label={t('复制回答', 'Copy answer')} notify={notify} /></div>
                <p className="text-content">{turn.answer}</p>
              </div>
            </article>)}
            {busy && <article className="conversation-turn pending"><div className="conversation-question"><span>{t('你', 'You')}</span><p className="text-content">{pendingQuestion}</p></div><Spinner label={t('正在整理解释…', 'Preparing an explanation…')} /></article>}
          </div>
          {syncError && <div className="inline-error" role="alert"><CircleAlert size={17} /><div>
            <strong>{t('对话已保存到学习库，Markdown 同步未完成', 'Conversation saved to your library; Markdown sync is incomplete')}</strong><p>{syncError}</p>
          </div></div>}
          {turns.length >= 20 ? <p className="tutor-limit" role="status">{t('这条结果已达到 20 轮追问上限。可以回到工作台开始新的练习。', 'This result has reached the limit of 20 follow-up turns. Start a new practice from the workbench.')}</p> : (
            <div className="tutor-compose">
              <label htmlFor={`${panelId}-question`}>{t('你的问题或补充信息', 'Your question or additional details')}</label>
              <textarea ref={inputRef} id={`${panelId}-question`} value={question} maxLength={4000} rows={3}
                disabled={busy} placeholder={t('例如：为什么这里用过去完成时？能再举个更日常的例子吗？', 'For example: Why use the past perfect here? Could you give a more everyday example?')}
                onChange={(event) => { setQuestion(event.target.value); setError(''); }}
                onKeyDown={(event) => {
                  if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send(); }
                }} />
              {error && <div className="inline-error" role="alert"><CircleAlert size={17} /><div><strong>{t('追问没有完成', 'The follow-up could not be completed')}</strong><p>{error}</p><p>{t('问题已保留，可重试。', 'Your question is kept. You can try again.')}</p></div></div>}
              <div className="tutor-compose-footer"><span>{question.length.toLocaleString(language)} / {Number(4000).toLocaleString(language)} · {t('{count} / 20 轮', '{count} / 20 turns', { count: turns.length })}</span>
                <button className="button primary small" disabled={busy || !question.trim() || loading} onClick={() => void send()} title="Ctrl + Enter">
                  {busy ? <Spinner label={t('回答中', 'Answering')} /> : <><Send size={15} />{error ? t('重试追问', 'Retry question') : t('发送追问', 'Send question')}</>}
                </button>
              </div>
            </div>
          )}
        </>}
      </div>}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prior?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Tab') {
            const elements = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
              ) || [],
            );
            const first = elements[0],
              last = elements.at(-1);
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === ref.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !elements.length)) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label={t('关闭', 'Close')} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}
export function formatDate(value: string, locale = 'zh-CN') {
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

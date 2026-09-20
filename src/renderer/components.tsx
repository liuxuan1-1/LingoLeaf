import { Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Copy, Leaf, LoaderCircle, MessageCircle, Minus, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Analysis, ChatMessage, ConversationTurn, Entry, Mode } from '../shared/types';
import { api, errorMessage } from './bridge';
import { MODE_INFO } from './modes';

export type Notify = (message: string, kind?: 'success' | 'error') => void;
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-icon">
        <Leaf size={compact ? 21 : 26} strokeWidth={1.7} />
      </span>
      <div>
        <strong>
          LingoLeaf<span>.</span>
        </strong>
        {!compact && <small>一点积累，自然生长</small>}
      </div>
    </div>
  );
}
export function TitleBar({ popup = false }: { popup?: boolean }) {
  return (
    <div className={`titlebar ${popup ? 'popup-titlebar' : ''}`}>
      <span>{popup ? <Brand compact /> : 'LINGOLEAF / A LITTLE, EVERY DAY'}</span>
      <div className="window-controls">
        <button aria-label="最小化" title="最小化" onClick={api.minimize}>
          <Minus size={15} />
        </button>
        <button
          aria-label={popup ? '关闭弹窗' : '隐藏到系统托盘'}
          title={popup ? '关闭弹窗' : '隐藏到系统托盘，快捷键继续工作'}
          className="window-close"
          onClick={api.close}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
export function Spinner({ label = '正在处理' }: { label?: string }) {
  return (
    <span className="loading-inline">
      <LoaderCircle size={17} className="spin" />
      {label}
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
  label = '复制',
}: {
  text: string;
  notify?: Notify;
  label?: string;
}) {
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
      {copied ? '已复制' : label}
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
  const saved = result as Partial<Entry>;
  const savedId = entryId || saved.id;
  const grammarIssues = result.issues.filter((issue) => issue.kind === 'grammar');
  const content = {
    grammar: { title: result.isCorrect ? '这句话，语法没有错误' : `发现 ${grammarIssues.length || result.issues.length || 1} 处可以改进的语法`, caption: result.isCorrect ? 'LOOKING GOOD' : 'A CHANCE TO GROW', field: '建议表达' },
    translate: { title: '让表达，跨越语言', caption: 'TRANSLATION', field: '译文' },
    read: { title: '读懂意思，也理解结构', caption: 'READ & UNDERSTAND', field: '译文' },
    express: { title: '为你的意思，找到合适的表达', caption: 'FIND YOUR WORDS', field: '推荐表达' },
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
          {result.expressionContext && <><dt>场景</dt><dd className="text-content">{result.expressionContext}</dd></>}
          {result.expressionTone && <><dt>语气</dt><dd className="text-content">{result.expressionTone}</dd></>}
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
            <span>句意{result.translationLanguage ? ` · ${result.translationLanguage}` : ''}</span>
            <CopyButton text={result.translation} notify={notify} label="复制译文" />
          </div>
          <p className="text-content">{result.translation}</p>
        </div>
      )}
      {result.explanation && (
        <p className="result-explanation text-content">{result.explanation}</p>
      )}
      {!!result.grammarPoints?.length && (
        <section className="learning-section" aria-label="语法解析">
          <h4 className="section-label">语法解析 <span>{result.grammarPoints.length}</span></h4>
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
        <section className="learning-section key-points" aria-label="要点摘要">
          <h4 className="section-label">要点摘要</h4>
          <ul>{result.keyPoints.map((point, index) => <li className="text-content" key={index}>{point}</li>)}</ul>
        </section>
      )}
      {!!result.alternatives?.length && (
        <section className="learning-section" aria-label="其他表达与区别">
          <h4 className="section-label">其他表达与区别</h4>
          <div className="expression-alternatives">
            {result.alternatives.map((alternative, index) => (
              <article className="expression-alternative" key={index}>
                <div className="field-topline">
                  <span>{alternative.tone || `表达 ${index + 1}`}</span>
                  <CopyButton text={alternative.text} notify={notify} label="复制表达" />
                </div>
                <p className="alternative-text text-content">{alternative.text}</p>
                <p className="alternative-reason text-content">{alternative.explanation}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {!!result.clarificationQuestions?.length && (
        <section className="learning-section clarification" aria-label="可以补充的信息">
          <h4 className="section-label">补充这些信息，表达会更贴切</h4>
          <ul>{result.clarificationQuestions.map((question, index) => <li className="text-content" key={index}>{question}</li>)}</ul>
          <p>可以在下方追问中补充你的答案。</p>
        </section>
      )}
      {result.issues.length > 0 && (
        <div className="issues">
          <div className="section-label">
            理解每一个改变 <span>{result.issues.length}</span>
          </div>
          {result.issues.map((issue, i) => (
            <article className="issue" key={i}>
              <div className="issue-header">
                <span className="issue-number">{String(i + 1).padStart(2, '0')}</span>
                <strong className="text-content">
                  {issue.rule || (issue.kind === 'grammar' ? '语法修改' : '表达建议')}
                </strong>
                <span className={`tag ${issue.kind === 'style' ? 'neutral' : 'amber'}`}>
                  {issue.kind === 'style' ? '风格建议' : '语法'}
                </span>
              </div>
              <div className="issue-diff">
                <del className="text-content">{issue.original || '（省略）'}</del>
                <ChevronRight size={14} />
                <ins className="text-content">{issue.replacement || '（删除）'}</ins>
              </div>
              <p className="text-content">{issue.explanation}</p>
            </article>
          ))}
        </div>
      )}
      {result.example && (
        <div className="example-block">
          <span className="eyebrow">TRY ANOTHER SENTENCE</span>
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
      if (!entry) throw new Error('这条笔记已不存在，请重新分析原文后继续。');
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
  }, [open, entryId]);
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
      if (entryId && !response.entry) throw new Error('回答没有保存成功，请重试。');
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
    <section className="tutor-panel" aria-label="关于这条结果的追问">
      <button className="tutor-toggle" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}>
        <MessageCircle size={19} />
        <span><strong>还想问问？</strong><small>继续理解这条结果{turns.length ? ` · ${turns.length} 轮对话` : ''}</small></span>
        <ChevronDown size={18} className={open ? 'is-open' : ''} />
      </button>
      {open && <div className="tutor-content" id={panelId}>
        <p className="tutor-caption">追问结合当前结果和近期对话回答。
          {entryId ? '回答会随这条学习笔记保存在本机，并同步到 Markdown。' : '这条结果未收藏，对话仅在当前页面保留；离开页面或重新分析会清空。'}</p>
        {loading && <Spinner label="正在载入这条笔记的对话…" />}
        {loadError && <div className="inline-error" role="alert"><CircleAlert size={17} /><div>
          <p>{loadError}</p><button className="text-button" onClick={() => void loadHistory()}>重新载入对话</button>
        </div></div>}
        {loaded && <>
          <div className="conversation-list" ref={conversationRef} aria-label="追问记录" tabIndex={turns.length ? 0 : undefined} aria-live="polite" aria-relevant="additions text">
            {turns.map((turn, index) => <article className="conversation-turn" key={turn.id}>
              <div className="conversation-question"><span>你 · {index + 1}</span><p className="text-content">{turn.question}</p></div>
              <div className="conversation-answer"><div className="field-topline"><span>语言助手</span>
                <CopyButton text={turn.answer} label="复制回答" notify={notify} /></div>
                <p className="text-content">{turn.answer}</p>
              </div>
            </article>)}
            {busy && <article className="conversation-turn pending"><div className="conversation-question"><span>你</span><p className="text-content">{pendingQuestion}</p></div><Spinner label="正在整理解释…" /></article>}
          </div>
          {syncError && <div className="inline-error" role="alert"><CircleAlert size={17} /><div>
            <strong>对话已保存到学习库，Markdown 同步未完成</strong><p>{syncError}</p>
          </div></div>}
          {turns.length >= 20 ? <p className="tutor-limit" role="status">这条结果已达到 20 轮追问上限。可以回到工作台开始新的练习。</p> : (
            <div className="tutor-compose">
              <label htmlFor={`${panelId}-question`}>你的问题或补充信息</label>
              <textarea ref={inputRef} id={`${panelId}-question`} value={question} maxLength={4000} rows={3}
                disabled={busy} placeholder="例如：为什么这里用过去完成时？能再举个更日常的例子吗？"
                onChange={(event) => { setQuestion(event.target.value); setError(''); }}
                onKeyDown={(event) => {
                  if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send(); }
                }} />
              {error && <div className="inline-error" role="alert"><CircleAlert size={17} /><div><strong>追问没有完成</strong><p>{error}</p><p>问题已保留，可重试。</p></div></div>}
              <div className="tutor-compose-footer"><span>{question.length.toLocaleString()} / 4,000 · {turns.length} / 20 轮</span>
                <button className="button primary small" disabled={busy || !question.trim() || loading} onClick={() => void send()} title="Ctrl + Enter">
                  {busy ? <Spinner label="回答中" /> : <><Send size={15} />{error ? '重试追问' : '发送追问'}</>}
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
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
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
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

import { Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Copy, Leaf, LoaderCircle, MessageCircle, Minus, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Analysis, ChatMessage, ConversationTurn, Entry, ImageInput, Mode } from '../shared/types';
import { api, errorMessage } from './bridge';
import { getToneRewriteTitle, MODE_INFO } from './modes';
import { useI18n } from './i18n';
import { ImageAttachments, useImageInput } from './Images';

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
  contextImages = [],
}: {
  result: Analysis;
  notify?: Notify;
  compact?: boolean;
  entryId?: string;
  contextImages?: ImageInput[];
}) {
  const { t } = useI18n();
  const saved = result as Partial<Entry>;
  const savedId = entryId || saved.id;
  const grammarIssues = result.issues.filter((issue) => issue.kind === 'grammar');
  const replyUnclear = result.mode === 'reply' && (!result.replyReview || result.replyReview.verdict === 'unclear');
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
    reply: { title: replyUnclear ? t('还不能确认这条回复是否合适', 'This reply needs more context') : result.replyReview?.verdict === 'appropriate' ? t('这条回复回应了对方的问题', 'This reply addresses their question') : t('这条回复还有可以改进的地方', 'This reply could work better'), caption: t('结合上下文检查回复', 'REPLY IN CONTEXT'), field: t('建议回复', 'Suggested reply') },
  } satisfies Record<Mode, { title: string; caption: string; field: string }>;
  const current = content[result.mode];
  const StatusIcon = result.mode === 'grammar' ? CheckCheck : MODE_INFO[result.mode].icon;
  const contextKey = savedId || JSON.stringify(result);
  return (
    <div className={`result-view ${compact ? 'result-compact' : ''}`}>
      <div className="result-status">
        <span className={`result-check ${(result.mode === 'grammar' && !result.isCorrect) || (result.mode === 'reply' && result.replyReview?.verdict !== 'appropriate') ? 'needs-work' : ''}`}>
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
      {result.mode === 'reply' && <section className="reply-context learning-section" aria-label={t('识别到的对话', 'Recognized conversation')}>
        <dl className="expression-context">
          <dt>{t('对方的问题', 'Their question')}</dt><dd className="text-content">{result.replyReview?.question || t('尚未识别，请补充。', 'Not identified yet. Please add more context.')}</dd>
          <dt>{t('我的回复', 'My reply')}</dt><dd className="text-content">{result.replyReview?.reply || t('尚未识别，请补充。', 'Not identified yet. Please add more context.')}</dd>
        </dl>
        <h4 className="section-label">{t('是否答题、是否得体', 'Relevance and tone')}</h4>
        {result.replyReview?.explanation && <p className="text-content">{result.replyReview.explanation}</p>}
        {!!result.replyReview?.points.length && <ul>{result.replyReview.points.map((point, index) => <li key={index} className="text-content">{point}</li>)}</ul>}
        {(replyUnclear || result.replyReview?.uncertainty) && <div className="reply-uncertainty" role="note">
          <strong>{t('需要确认的上下文', 'Context to confirm')}</strong>
          <p className="text-content">{result.replyReview?.uncertainty || t('请补充清晰截图，并指出哪条是你的回复。', 'Add a clear screenshot and identify which message is your reply.')}</p>
        </div>}
        <p className="mode-help">{contextImages.length ? t('原图仅在当前页面保留，可在追问中继续使用。', 'Original images stay on this page and can be included in follow-ups.') : t('笔记保留了识别文字与点评，原图未保存；如需再次查看图片，请在追问中重新添加。', 'This note keeps recognized text and feedback. Original images were not saved; add them again in a follow-up if needed.')}</p>
      </section>}
      {result.mode === 'express' && (result.expressionContext || result.expressionTone) && (
        <dl className="expression-context">
          {result.expressionContext && <><dt>{t('场景', 'Context')}</dt><dd className="text-content">{result.expressionContext}</dd></>}
          {result.expressionTone && <><dt>{t('语气', 'Tone')}</dt><dd className="text-content">{result.expressionTone}</dd></>}
        </dl>
      )}
      {!replyUnclear && <div className="result-sentence">
        <div className="field-topline">
          <span>{current.field}{result.mode === 'read' && saved.targetLanguage ? ` · ${saved.targetLanguage}` : ''}</span>
          <CopyButton text={result.corrected} notify={notify} />
        </div>
        <p className="text-content" lang="">
          {result.corrected}
        </p>
      </div>}
      {(result.mode === 'grammar' || result.mode === 'reply') && !replyUnclear && result.translation && (
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
      {!replyUnclear && !!result.grammarPoints?.length && (
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
      {!replyUnclear && !!result.keyPoints?.length && (
        <section className="learning-section key-points" aria-label={t('要点摘要', 'Key points')}>
          <h4 className="section-label">{t('要点摘要', 'Key points')}</h4>
          <ul>{result.keyPoints.map((point, index) => <li className="text-content" key={index}>{point}</li>)}</ul>
        </section>
      )}
      {!replyUnclear && !!result.alternatives?.length && (
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
      {!replyUnclear && result.issues.length > 0 && (
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
      {(result.mode === 'grammar' || result.mode === 'reply') && !replyUnclear && result.professional && (
        <section className="professional-section learning-section" aria-label={getToneRewriteTitle(t, result.grammarTone)}>
          <div className="field-topline">
            <h4 className="section-label">{getToneRewriteTitle(t, result.grammarTone)}</h4>
            <CopyButton text={result.professional.text} notify={notify} label={!result.grammarTone || result.grammarTone === 'professional' ? t('复制专业表达', 'Copy professional version') : t('复制语气改写', 'Copy tone rewrite')} />
          </div>
          <p className="professional-caption">{t('可选的风格提升，不代表原句存在语法错误。根据对象和场景选择使用。', 'An optional style improvement, not a grammar error. Choose it when it suits your audience and context.')}</p>
          <p className="professional-text text-content" lang="">{result.professional.text}</p>
          <p className="text-content">{result.professional.explanation}</p>
          {!!result.professional.improvements.length && <>
            <h5>{t('可以学到的表达要点', 'What you can learn from this rewrite')}</h5>
            <ul>{result.professional.improvements.map((item, index) => <li className="text-content" key={index}>{item}</li>)}</ul>
          </>}
        </section>
      )}
      {!replyUnclear && result.example && (
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
      <TutorPanel key={contextKey} analysis={result} entryId={savedId} initialTurns={saved.conversation || []} contextImages={contextImages} notify={notify} />
    </div>
  );
}

/** A panel stays inside its owning result, including the library's existing dialog. */
export function TutorPanel({ analysis, entryId, initialTurns, contextImages = [], notify }: {
  analysis: Analysis;
  entryId?: string;
  initialTurns: ConversationTurn[];
  contextImages?: ImageInput[];
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
  const [images, setImages] = useState<ImageInput[]>(contextImages);
  const [saveError, setSaveError] = useState('');
  const temporary = useRef(false);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const refreshAfterSend = useRef(false);
  const loadSequence = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const imageInput = useImageInput({ images, onChange: setImages, onError: setError, disabled: busy || loading });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);
  useEffect(() => {
    const list = conversationRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, turns.length, busy]);
  const loadHistory = async () => {
    if (!entryId || temporary.current) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const state = await api.getState();
      if (!mounted.current || temporary.current || sequence !== loadSequence.current) return;
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
    if (!open || !entryId || temporary.current) return;
    if (!submitting.current) void loadHistory();
    return api.onChanged(() => {
      if (temporary.current) return;
      if (submitting.current) { refreshAfterSend.current = true; return; }
      void loadHistory();
    });
  }, [open, entryId, language]);
  const send = async () => {
    const value = question.trim() || (images.length ? 'Please review my reply in the attached conversation.' : '');
    if (!value || submitting.current || !loaded || loading || imageInput.reading || turns.length >= 20) return;
    submitting.current = true;
    // A response to an earlier history read must never replace this new answer.
    loadSequence.current += 1;
    refreshAfterSend.current = false;
    setBusy(true);
    setError('');
    setPendingQuestion(value);
    const persistentId = temporary.current ? undefined : entryId;
    const history: ChatMessage[] = persistentId ? [] : turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      { role: 'assistant' as const, content: turn.answer },
    ]);
    try {
      const response = await api.ask({ analysis, entryId: persistentId, history, question: value, images });
      if (!mounted.current) return;
      if (persistentId && (response.saveError || !response.entry)) {
        temporary.current = true;
        setSaveError(response.saveError || t('回答没有保存成功，请重试。', 'The answer could not be saved. Please try again.'));
      }
      setTurns((response.saveError && response.temporaryConversation) || (!response.saveError && response.entry?.conversation) || [...turns, {
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
        if (entryId && !temporary.current && refreshAfterSend.current) void loadHistory();
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
      {open && <div className="tutor-content" id={panelId} onPaste={imageInput.onPaste}>
        <p className="tutor-caption">{t('追问结合当前结果和近期对话回答。', 'Answers use this result and your recent conversation.')} {' '}
          {entryId && !temporary.current ? t('回答会随这条学习笔记保存在本机，并同步到 Markdown。', 'Answers are saved locally with this note and synced to Markdown.') : t('对话仅临时保留；切换任务、关闭结果或重新分析会清空。请复制需要保留的回答。', 'This conversation is temporary. Switching tasks, closing the result or analyzing again clears it. Copy any answers you want to keep.')}</p>
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
          {saveError && <div className="inline-error" role="alert"><CircleAlert size={17} /><div>
            <strong>{t('回答已生成，但未保存', 'Answer received, but not saved')}</strong><p>{saveError}</p>
            <p>{t('后续追问会使用完整上下文，但对话仅临时保留；切换任务、关闭结果或重新分析会清空。请复制需要保存的回答。', 'Further questions use the full context, but the conversation is temporary. Switching tasks, closing the result or analyzing again clears it. Copy any answers you want to save.')}</p>
          </div></div>}
          {turns.length >= 20 ? <p className="tutor-limit" role="status">{t('这条结果已达到 20 轮追问上限。可以回到工作台开始新的练习。', 'This result has reached the limit of 20 follow-up turns. Start a new practice from the workbench.')}</p> : (
            <div className="tutor-compose">
              <label htmlFor={`${panelId}-question`}>{t('你的问题或补充信息', 'Your question or additional details')}</label>
              <textarea ref={inputRef} id={`${panelId}-question`} value={question} maxLength={4000} rows={3}
                disabled={busy || imageInput.reading} placeholder={t('例如：为什么这里用过去完成时？能再举个更日常的例子吗？', 'For example: Why use the past perfect here? Could you give a more everyday example?')}
                onChange={(event) => { setQuestion(event.target.value); setError(''); }}
                onKeyDown={(event) => {
                  if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send(); }
                }} />
              <ImageAttachments images={images} addFiles={imageInput.addFiles} reading={imageInput.reading} disabled={busy || loading}
                onRemove={(index) => setImages((current) => current.filter((_, i) => i !== index))} />
              <p className="mode-help">{images.length ? t('发送追问时会包含上面的图片。原图不会保存到笔记。', 'Sending a follow-up includes the images above. Original images are not saved in notes.') : t('可添加截图补充上下文；需要支持图片的模型。', 'Add a screenshot for context. A vision-capable model is required.')}</p>
              {error && <div className="inline-error" role="alert"><CircleAlert size={17} /><div><strong>{t('追问没有完成', 'The follow-up could not be completed')}</strong><p>{error}</p><p>{t('问题已保留，可重试。', 'Your question is kept. You can try again.')}</p></div></div>}
              <div className="tutor-compose-footer"><span>{question.length.toLocaleString(language)} / {Number(4000).toLocaleString(language)} · {t('{count} / 20 轮', '{count} / 20 turns', { count: turns.length })}</span>
                <button className="button primary small" disabled={busy || (!question.trim() && !images.length) || loading || imageInput.reading} onClick={() => void send()} title="Ctrl + Enter">
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

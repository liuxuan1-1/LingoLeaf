import {
  ArrowRight, BookOpen, BookOpenCheck, CheckCircle2, CircleAlert, CornerDownLeft,
  Leaf, MessageCircle, MousePointer2, Sparkles, WandSparkles, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, ExpressionOptions, Mode, Settings } from '../shared/types';
import { api, errorMessage } from './bridge';
import { ResultView, Shortcut, Spinner, type Notify } from './components';
import { useI18n } from './i18n';

type Draft = { text: string; context: string; tone: string; result: AnalysisResult | null; error: string };
type PracticeInitial = { text: string; mode: Mode; key: number; options?: ExpressionOptions } | null;
type Task = 'grammar' | 'read' | 'express';
const TASKS: Task[] = ['grammar', 'read', 'express'];
const EXPRESSION_MODES = ['translate', 'express'] as const;
const emptyDraft = (): Draft => ({ text: '', context: '', tone: '', result: null, error: '' });
const initialDraft = (initial: NonNullable<PracticeInitial>): Draft => ({
  ...emptyDraft(), text: initial.text, context: initial.options?.context || '', tone: initial.options?.tone || '',
});
const taskForMode = (mode: Mode): Task => mode === 'translate' ? 'express' : mode;

export function Workbench({ settings, notify, onSettings, initial, onDone, syncError }: {
  settings: Settings;
  notify: Notify;
  onSettings: () => void;
  initial: PracticeInitial;
  onDone: () => Promise<void>;
  syncError?: string | null;
}) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<Mode>(initial?.mode || 'grammar');
  const [expressionMode, setExpressionMode] = useState<'translate' | 'express'>(initial?.mode === 'express' ? 'express' : 'translate');
  const [drafts, setDrafts] = useState<Record<Mode, Draft>>(() => {
    const values = { grammar: emptyDraft(), translate: emptyDraft(), read: emptyDraft(), express: emptyDraft() };
    if (initial) values[initial.mode] = initialDraft(initial);
    return values;
  });
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const submitting = useRef(false);
  const { text, context, tone, result, error } = drafts[mode];
  const task = taskForMode(mode);
  const updateDraft = (patch: Partial<Draft>, value: Mode = mode) => {
    setDrafts((all) => ({ ...all, [value]: { ...all[value], ...patch } }));
  };
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    if (initial) {
      request.current += 1;
      submitting.current = false;
      setDrafts((all) => ({ ...all, [initial.mode]: initialDraft(initial) }));
      setMode(initial.mode);
      if (initial.mode === 'translate' || initial.mode === 'express') setExpressionMode(initial.mode);
      setBusy(false);
    }
  }, [initial]);
  const changeMode = (value: Mode) => {
    if (submitting.current) return;
    setMode(value);
    if (value === 'translate' || value === 'express') setExpressionMode(value);
  };
  const selectTask = (value: Task) => changeMode(value === 'express' ? expressionMode : value);
  const analyze = async () => {
    if (!text.trim() || submitting.current) return;
    const id = ++request.current;
    const submittedMode = mode;
    submitting.current = true;
    setBusy(true);
    updateDraft({ error: '', result: null }, submittedMode);
    try {
      const response = await api.analyze(text, submittedMode, submittedMode === 'express' ? { context, tone } : undefined);
      if (id === request.current) updateDraft({ result: response }, submittedMode);
      await onDone();
    } catch (e) {
      if (id === request.current) updateDraft({ error: errorMessage(e) }, submittedMode);
    } finally {
      if (id === request.current) { submitting.current = false; setBusy(false); }
    }
  };
  const tasks = {
    grammar: {
      title: t('修改英文', 'Improve English'),
      description: t('修正语法，学习更正式、专业的写法。', 'Fix grammar and learn a more professional style.'),
      icon: WandSparkles,
    },
    read: {
      title: t('读懂外语', 'Understand a text'),
      description: t('翻译为讲解语言，拆解语法并提炼要点。', 'Read a translation, grammar breakdown, and key points.'),
      icon: BookOpen,
    },
    express: {
      title: t('表达想法', 'Express an idea'),
      description: t('翻译完整原文，或把零散想法组织成句。', 'Translate a complete text or put rough ideas into words.'),
      icon: MessageCircle,
    },
  };
  const expressionChoices = {
    translate: { title: t('已有完整原文', 'Translate a text'), description: t('保留原意，翻译成目标语言。', 'Keep your meaning and translate it into your target language.') },
    express: { title: t('只有大致想法', 'Shape an idea'), description: t('补充场景与语气，得到多种说法。', 'Add context and tone to explore different ways to say it.') },
  };
  const copy = {
    grammar: {
      label: t('想改进哪一段英文？', 'What would you like to improve?'), direction: t('英语', 'English'),
      help: t('先修正语法，再单独提供更正式／专业的表达，帮助你理解两者的区别。', 'Get a grammar correction and a separate professional rewrite, with explanations of each.'),
      placeholder: t('例如：She go to school every day.', 'For example: She go to school every day.'),
      samples: ['She go to school every day.', 'I am agree with you.'],
      action: t('检查并改进', 'Check and improve'), loading: t('从语法正确，到表达得体。', 'From correct grammar to effective writing.'),
    },
    translate: {
      label: t('输入要翻译的完整原文', 'Enter the text to translate'), direction: `→ ${settings.targetLanguage}`,
      help: t('已有明确的句子或段落？保留原意，获得自然的译文和表达说明。', 'Have a complete sentence or paragraph? Get a natural translation that preserves your meaning, with usage notes.'),
      placeholder: t('例如：谢谢你的耐心，我会尽快回复。', 'For example: Thank you for your patience. I will get back to you soon.'),
      samples: [t('今天天气怎么样？', 'How is the weather today?'), t('谢谢你的耐心，我会尽快回复。', 'Thank you for your patience. I will get back to you soon.')],
      action: t('翻译原文', 'Translate a text'), loading: t('为你的想法，找到恰当的表达。', 'Finding the right words for your meaning.'),
    },
    read: {
      label: t('输入想读懂的外语原文', 'Enter the text you want to understand'),
      direction: `${settings.targetLanguage} → ${settings.explanationLanguage}`,
      help: t('将 {source} 原文译成 {language}，拆解语法并归纳要点。语言可在偏好设置中调整。', 'Translate {source} into {language}, break down the grammar, and summarize the key points. You can change these languages in Settings.', { source: settings.targetLanguage, language: settings.explanationLanguage }),
      placeholder: t('例如：Had I known about the delay, I would have taken an earlier train.', 'For example: Had I known about the delay, I would have taken an earlier train.'),
      samples: ['Had I known about the delay, I would have taken an earlier train.', 'What matters most is how we respond to change.'],
      action: t('翻译并解析', 'Translate and explain'), loading: t('从句意到结构，一起读懂。', 'Understanding both meaning and structure.'),
    },
    express: {
      label: t('想说什么？零散的想法也可以', 'What do you want to say? Rough ideas are welcome'), direction: `→ ${settings.targetLanguage}`,
      help: t('用任何语言、关键词或零散想法描述大意，得到推荐表达、备选说法及区别。', 'Use any language, keywords, or rough ideas to get a suggested expression, alternatives, and explanations of the differences.'),
      placeholder: t('例如：想告诉同事我最近有点忙，不想显得在拒绝，但希望下周再帮他看看。', 'For example: Busy this week; want to help my colleague next week without sounding dismissive.'),
      samples: [t('有点忙，想把同事的请求推到下周，但不想太冷淡。', 'Busy this week; want to help my colleague next week without sounding dismissive.'), t('这个想法很有启发，突然想通了，但不知道怎么自然地说。', 'An idea helped everything click, but I do not know how to say that naturally.')],
      action: t('帮我组织表达', 'Help me phrase it'), loading: t('把模糊的意思，变成清楚的表达。', 'Turning rough ideas into clear expressions.'),
    },
  } satisfies Record<Mode, { label: string; direction: string; help: string; placeholder: string; samples: string[]; action: string; loading: string }>;
  const current = copy[mode];
  return (
    <section className="workbench-grid" aria-label={t('句子练习', 'Language practice')}>
      <div className="practice-task-nav">
        <h2 className="task-picker-label">{t('今天想做什么？', 'What would you like to do?')}</h2>
        <div className="practice-tasks" role="tablist" aria-label={t('选择练习任务', 'Choose a practice task')}>
          {TASKS.map((value, index) => {
            const item = tasks[value], Icon = item.icon;
            return <button key={value} id={`task-${value}`} role="tab" aria-selected={task === value}
              aria-controls="practice-panel" tabIndex={task === value ? 0 : -1}
              className={`practice-task ${task === value ? 'selected' : ''}`} disabled={busy}
              onClick={() => selectTask(value)} onKeyDown={(event) => {
                const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % TASKS.length
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + TASKS.length - 1) % TASKS.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? TASKS.length - 1 : null;
                if (next === null) return;
                event.preventDefault(); selectTask(TASKS[next]); document.getElementById(`task-${TASKS[next]}`)?.focus();
              }}>
              <span className="practice-task-icon"><Icon size={22} /></span>
              <span className="practice-task-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
              <span className="practice-task-check" aria-hidden="true">{task === value && <CheckCircle2 size={19} />}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="card composer" id="practice-panel" role="tabpanel" aria-labelledby={`task-${task}`}>
        {task === 'express' && <div className="expression-switch">
          <h3 id="expression-choice-label">{t('你现在准备好了什么？', 'What are you starting with?')}</h3>
          <div className="expression-choices" role="radiogroup" aria-labelledby="expression-choice-label">
            {EXPRESSION_MODES.map((value, index) => <button key={value} id={`expression-${value}`} role="radio"
              aria-checked={mode === value} tabIndex={mode === value ? 0 : -1}
              className={`expression-choice ${mode === value ? 'selected' : ''}`} disabled={busy}
              onClick={() => changeMode(value)} onKeyDown={(event) => {
                const next = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key) ? 1 - index
                  : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
                if (next === null) return;
                event.preventDefault(); changeMode(EXPRESSION_MODES[next]); document.getElementById(`expression-${EXPRESSION_MODES[next]}`)?.focus();
              }}>
              <span className="expression-choice-indicator" aria-hidden="true">{mode === value && <CheckCircle2 size={18} />}</span>
              <span><strong>{expressionChoices[value].title}</strong><small>{expressionChoices[value].description}</small></span>
            </button>)}
          </div>
        </div>}
        <div className="composer-label">
          <label htmlFor="sentence-input">{current.label}</label>
          <span className="language-direction">{current.direction}</span>
        </div>
        <p className="mode-help" id="mode-help">{current.help}</p>
        <div className="textarea-shell">
          <textarea id="sentence-input" spellCheck={false} value={text} maxLength={12000} disabled={busy}
            placeholder={current.placeholder} aria-describedby="mode-help"
            onChange={(event) => updateDraft({ text: event.target.value, result: null, error: '' })}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault(); void analyze();
              }
            }} />
          <div className="textarea-footer">
            <span>{t('输入或粘贴内容；切换任务会保留草稿', 'Type or paste here. Drafts stay when you switch tasks.')}</span>
            <span>{text.length.toLocaleString(language)} / {Number(12000).toLocaleString(language)}</span>
          </div>
        </div>
        {mode === 'express' && <div className="expression-options">
          <label className="form-field"><span>{t('场景与对象', 'Context and audience')} <small>{t('可选', 'Optional')}</small></span>
            <textarea value={context} maxLength={2000} rows={2} disabled={busy}
              placeholder={t('例如：给同事发消息，希望保持友好', 'For example: A friendly message to a colleague')}
              onChange={(event) => updateDraft({ context: event.target.value, result: null, error: '' })} />
          </label>
          <label className="form-field"><span>{t('希望的语气', 'Preferred tone')} <small>{t('可选', 'Optional')}</small></span>
            <input value={tone} maxLength={200} disabled={busy}
              placeholder={t('例如：自然、委婉，或简短正式', 'For example: Natural and tactful, or concise and formal')}
              onChange={(event) => updateDraft({ tone: event.target.value, result: null, error: '' })} />
          </label>
        </div>}
        <div className="sample-row"><span>{t('试试示例', 'Try an example')}</span>
          {current.samples.map((sample) => <button key={sample} disabled={busy}
            onClick={() => updateDraft({ text: sample, result: null, error: '' })}>{sample}<ArrowRight size={12} /></button>)}
        </div>
        <div className="composer-bottom">
          <span className="privacy-caption"><Leaf size={13} />{t('只发送你主动提交的文字', 'Only text you submit is sent')}</span>
          <button className="button primary" disabled={busy || !text.trim()} onClick={() => void analyze()} title="Ctrl + Enter">
            {busy ? <Spinner label={t('正在细读你的句子…', 'Reading your text…')} /> : <><Sparkles size={17} />{current.action}<span className="button-enter"><CornerDownLeft size={12} /></span></>}
          </button>
        </div>
        {error && <div className="inline-error" role="alert"><CircleAlert size={18} /><div>
          <strong>{t('这次请求没有完成', 'This request could not be completed')}</strong><p>{error}</p>
          <button className="text-button" onClick={onSettings}>{t('检查模型设置', 'Check model settings')}<ArrowRight size={14} /></button>
        </div></div>}
      </div>
      <div className={`card insight-card ${result ? 'has-result' : ''}`} aria-live="polite">
        {busy ? <div className="analysis-loading">
          <div className="orb"><Sparkles size={30} strokeWidth={1.4} /></div>
          <span className="eyebrow">{t('一点新的理解', 'A MOMENT OF DISCOVERY')}</span><h3>{current.loading}</h3>
          <p>{t('正在联系你配置的模型，请稍候。', 'Contacting your configured model. Please wait.')}</p>
          <div className="loading-bars"><span /><span /><span /></div>
        </div> : result ? <>
          <div className="insight-head"><span className="eyebrow">{t('你的语言笔记', 'YOUR LANGUAGE NOTE')}</span>
            <button className="icon-button" aria-label={t('清空结果', 'Clear result')} onClick={() => updateDraft({ result: null })}><X size={16} /></button>
          </div>
            <ResultView key={mode} result={result} entryId={result.entryId} notify={notify} compact />
          <div className="saved-note"><BookOpenCheck size={15} />
            {!result.entryId ? t('语法正确的句子未自动收藏，可在设置中开启。', 'Grammatically correct sentences are not saved automatically. You can enable this in Settings.')
              : syncError ? t('已保存到学习库；Markdown 同步需要处理，请查看顶部提示。', 'Saved to your library. Markdown sync needs attention; see the notice above.')
              : t('已整理到学习库与 Markdown 笔记。', 'Saved to your library and Markdown notes.')}
          </div>
        </> : <div className="intro-card">
          <div className="intro-card-top"><span className="eyebrow">{t('每天一点积累', 'YOUR EVERYDAY COMPANION')}</span><span className="mini-leaf"><Leaf size={18} /></span></div>
          <h2>{t('不只是改对，', 'Write it well.')}<br /><em>{t('更要学会。', 'Learn why it works.')}</em></h2>
          <p className="intro-description">{t('知道为什么，下一次就能写得更好。', 'Understand why, and write better next time.')}<br />{t('你的每一次练习，都会成为自己的积累。', 'Build your own collection with every practice.')}</p>
          <div className="how-it-works">
            <div><span>01</span><div><strong>{t('选中一句话', 'Select a sentence')}</strong><p>{t('邮件、网页、文档，随时开始。', 'Start from an email, webpage, or document.')}</p></div><MousePointer2 size={18} /></div>
            <div><span>02</span><div><strong>{t('按下快捷键，读懂修改', 'Use a shortcut to understand the changes')}</strong><p>{t('指出具体错误，也解释背后的规则。', 'See specific corrections and the rules behind them.')}</p></div><WandSparkles size={18} /></div>
            <div><span>03</span><div><strong>{t('留下笔记，适时复习', 'Save a note and review it')}</strong><p>{t('让眼前的理解，变成长久的记忆。', 'Turn understanding into lasting knowledge.')}</p></div><BookOpenCheck size={18} /></div>
          </div>
          <div className="shortcut-guide"><span>{t('全局语法纠错', 'Global grammar shortcut')}</span><Shortcut value={settings.grammarShortcut} /></div>
        </div>}
      </div>
    </section>
  );
}

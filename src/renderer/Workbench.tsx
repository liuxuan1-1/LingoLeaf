import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  CornerDownLeft,
  Leaf,
  MousePointer2,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, ExpressionOptions, Mode, Settings } from '../shared/types';
import { api, errorMessage } from './bridge';
import { ResultView, Shortcut, Spinner, type Notify } from './components';
import { MODE_INFO, MODES } from './modes';

export function Workbench({
  settings,
  notify,
  onSettings,
  initial,
  onDone,
  syncError,
}: {
  settings: Settings;
  notify: Notify;
  onSettings: () => void;
  initial: { text: string; mode: Mode; key: number; options?: ExpressionOptions } | null;
  onDone: () => Promise<void>;
  syncError?: string | null;
}) {
  const [mode, setMode] = useState<Mode>('grammar');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [context, setContext] = useState('');
  const [tone, setTone] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    if (initial) {
      request.current += 1;
      setText(initial.text);
      setMode(initial.mode);
      setContext(initial.options?.context || '');
      setTone(initial.options?.tone || '');
      setBusy(false);
      setResult(null);
      setError('');
    }
  }, [initial]);
  const changeMode = (value: Mode) => {
    setMode(value);
    setResult(null);
    setError('');
  };
  const analyze = async () => {
    if (!text.trim() || busy) return;
    const id = ++request.current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await api.analyze(text, mode, mode === 'express' ? { context, tone } : undefined);
      if (id === request.current) setResult(response);
      await onDone();
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const copy = {
    grammar: {
      label: '今天，想练习哪一句？', direction: '英语',
      help: '检查语法、读懂修改，并查看句意。',
      placeholder: '例如：She go to school every day.',
      samples: ['She go to school every day.', 'I am agree with you.'],
      action: '检查这句话', loading: '每个细节，都值得读懂。',
    },
    translate: {
      label: `把这段话，翻译为 ${settings.targetLanguage}`, direction: `→ ${settings.targetLanguage}`,
      help: '输入原文，获得自然的译文和表达说明。',
      placeholder: '例如：谢谢你的耐心，我会尽快回复。',
      samples: ['今天天气怎么样？', '谢谢你的耐心，我会尽快回复。'],
      action: '翻译这段话', loading: '为你的想法，找到恰当的表达。',
    },
    read: {
      label: '读懂这段话，也读懂它的结构',
      direction: `${settings.targetLanguage} → ${settings.explanationLanguage}`,
      help: `将 ${settings.targetLanguage} 原文译成 ${settings.explanationLanguage}，拆解语法并归纳要点。语言可在偏好设置中调整。`,
      placeholder: '例如：Had I known about the delay, I would have taken an earlier train.',
      samples: ['Had I known about the delay, I would have taken an earlier train.', 'What matters most is how we respond to change.'],
      action: '翻译并解析', loading: '从句意到结构，一起读懂。',
    },
    express: {
      label: '想说什么？零散的想法也可以', direction: `→ ${settings.targetLanguage}`,
      help: `用中文、${settings.targetLanguage} 或混合语言描述大意，得到推荐表达和不同说法。`,
      placeholder: '例如：想告诉同事我最近有点忙，不想显得在拒绝，但希望下周再帮他看看。',
      samples: ['有点忙，想把同事的请求推到下周，但不想太冷淡。', '这个想法很有启发，突然想通了，但不知道怎么自然地说。'],
      action: '帮我组织表达', loading: '把模糊的意思，变成清楚的表达。',
    },
  } satisfies Record<Mode, { label: string; direction: string; help: string; placeholder: string; samples: string[]; action: string; loading: string }>;
  const current = copy[mode];
  return (
    <section className="workbench-grid" aria-label="句子练习">
      <div className="card composer">
        <div className="composer-top">
          <div className="segmented practice-modes" role="tablist" aria-label="练习方式">
            {MODES.map((value, index) => {
              const Icon = MODE_INFO[value].icon;
              return <button key={value} id={`mode-${value}`} role="tab"
                aria-selected={mode === value} aria-controls="practice-panel"
                tabIndex={mode === value ? 0 : -1}
                className={mode === value ? 'selected' : ''} disabled={busy}
                onClick={() => changeMode(value)}
                onKeyDown={(event) => {
                  const next = event.key === 'ArrowRight' ? (index + 1) % MODES.length
                    : event.key === 'ArrowLeft' ? (index + MODES.length - 1) % MODES.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? MODES.length - 1 : null;
                  if (next === null) return;
                  event.preventDefault();
                  changeMode(MODES[next]);
                  document.getElementById(`mode-${MODES[next]}`)?.focus();
                }}>
                <Icon size={17} />{MODE_INFO[value].label}
              </button>;
            })}
          </div>
        </div>
        <div id="practice-panel" role="tabpanel" aria-labelledby={`mode-${mode}`}>
        <div className="composer-label">
          <label htmlFor="sentence-input">{current.label}</label>
          <span className="language-direction">{current.direction}</span>
        </div>
        <p className="mode-help" id="mode-help">{current.help}</p>
        <div className="textarea-shell">
          <textarea
            id="sentence-input"
            spellCheck={false}
            value={text}
            maxLength={12000}
            disabled={busy}
            placeholder={current.placeholder}
            aria-describedby="mode-help"
            onChange={(event) => { setText(event.target.value); setResult(null); setError(''); }}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void analyze();
              }
            }}
          />
          <div className="textarea-footer">
            <span>在这里输入，或粘贴你遇到的句子</span>
            <span>{text.length.toLocaleString()} / 12,000</span>
          </div>
        </div>
        {mode === 'express' && (
          <div className="expression-options">
            <label className="form-field">
              <span>场景与对象 <small>可选</small></span>
              <textarea value={context} maxLength={2000} rows={2} disabled={busy}
                placeholder="例如：给同事发消息，希望保持友好"
                onChange={(event) => { setContext(event.target.value); setResult(null); }} />
            </label>
            <label className="form-field">
              <span>希望的语气 <small>可选</small></span>
              <input value={tone} maxLength={200} disabled={busy}
                placeholder="例如：自然、委婉，或简短正式"
                onChange={(event) => { setTone(event.target.value); setResult(null); }} />
            </label>
          </div>
        )}
        <div className="sample-row">
          <span>试试示例</span>
          {current.samples.map((sample) => (
            <button
              key={sample}
              disabled={busy}
              onClick={() => {
                setText(sample);
                setResult(null);
                setError('');
              }}
            >
              {sample}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
        <div className="composer-bottom">
          <span className="privacy-caption">
            <Leaf size={13} />
            只发送你主动提交的文字
          </span>
          <button
            className="button primary"
            disabled={busy || !text.trim()}
            onClick={analyze}
            title="Ctrl + Enter"
          >
            {busy ? (
              <Spinner label="正在细读你的句子…" />
            ) : (
              <>
                <Sparkles size={17} />
                {current.action}
                <span className="button-enter">
                  <CornerDownLeft size={12} />
                </span>
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="inline-error" role="alert">
            <CircleAlert size={18} />
            <div>
              <strong>这次请求没有完成</strong>
              <p>{error}</p>
              <button className="text-button" onClick={onSettings}>
                检查模型设置
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      <div className={`card insight-card ${result ? 'has-result' : ''}`} aria-live="polite">
        {busy ? (
          <div className="analysis-loading">
            <div className="orb">
              <Sparkles size={30} strokeWidth={1.4} />
            </div>
            <span className="eyebrow">A MOMENT OF DISCOVERY</span>
            <h3>
              {current.loading}
            </h3>
            <p>正在联系你配置的模型，请稍候。</p>
            <div className="loading-bars">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : result ? (
          <>
            <div className="insight-head">
              <span className="eyebrow">YOUR LANGUAGE NOTE</span>
              <button className="icon-button" aria-label="清空结果" onClick={() => setResult(null)}>
                <X size={16} />
              </button>
            </div>
            <ResultView key={request.current} result={result} entryId={result.entryId} notify={notify} compact />
            <div className="saved-note">
              <BookOpenCheck size={15} />
              {!result.entryId
                ? '语法正确的句子未自动收藏，可在设置中开启。'
                : syncError
                  ? '已保存到学习库；Markdown 同步需要处理，请查看顶部提示。'
                  : '已整理到学习库与 Markdown 笔记。'}
            </div>
          </>
        ) : (
          <div className="intro-card">
            <div className="intro-card-top">
              <span className="eyebrow">YOUR EVERYDAY COMPANION</span>
              <span className="mini-leaf">
                <Leaf size={18} />
              </span>
            </div>
            <h2>
              不只是改对，
              <br />
              <em>更要学会。</em>
            </h2>
            <p className="intro-description">
              知道为什么，下一次就能写得更好。
              <br />
              你的每一次练习，都会成为自己的积累。
            </p>
            <div className="how-it-works">
              <div>
                <span>01</span>
                <div>
                  <strong>选中一句话</strong>
                  <p>邮件、网页、文档，随时开始。</p>
                </div>
                <MousePointer2 size={18} />
              </div>
              <div>
                <span>02</span>
                <div>
                  <strong>按下快捷键，读懂修改</strong>
                  <p>指出具体错误，也解释背后的规则。</p>
                </div>
                <WandSparkles size={18} />
              </div>
              <div>
                <span>03</span>
                <div>
                  <strong>留下笔记，适时复习</strong>
                  <p>让眼前的理解，变成长久的记忆。</p>
                </div>
                <BookOpenCheck size={18} />
              </div>
            </div>
            <div className="shortcut-guide">
              <span>全局语法纠错</span>
              <Shortcut value={settings.grammarShortcut} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

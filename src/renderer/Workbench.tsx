import { ArrowRight, BookOpenCheck, CircleAlert, CornerDownLeft, Languages, Leaf, MousePointer2, Sparkles, WandSparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Analysis, Mode, Settings } from '../shared/types';
import { api, errorMessage } from './bridge';
import { ResultView, Shortcut, Spinner, type Notify } from './components';

export function Workbench({ settings, notify, onSettings, initial, onDone, syncError }: { settings: Settings; notify: Notify; onSettings: () => void; initial: { text: string; mode: Mode; key: number } | null; onDone: () => Promise<void>; syncError?: string | null }) {
  const [mode, setMode] = useState<Mode>('grammar');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (initial) { setText(initial.text); setMode(initial.mode); setResult(null); setError(''); } }, [initial]);
  const changeMode = (value: Mode) => { setMode(value); setResult(null); setError(''); };
  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try { const response = await api.analyze(text, mode); setResult(response); await onDone(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <section className="workbench-grid" aria-label="句子练习">
    <div className="card composer"><div className="composer-top"><div className="segmented" role="tablist" aria-label="练习方式"><button role="tab" aria-selected={mode === 'grammar'} className={mode === 'grammar' ? 'selected' : ''} onClick={() => changeMode('grammar')} disabled={busy}><WandSparkles size={16} />语法纠错</button><button role="tab" aria-selected={mode === 'translate'} className={mode === 'translate' ? 'selected' : ''} onClick={() => changeMode('translate')} disabled={busy}><Languages size={17} />翻译表达</button></div><span className="micro-label">{mode === 'grammar' ? 'WRITE & REFINE' : 'SAY IT ANOTHER WAY'}</span></div>
      <div className="composer-label"><label htmlFor="sentence-input">{mode === 'grammar' ? '今天，想练习哪一句？' : `把你的想法，表达为 ${settings.targetLanguage}`}</label><span>{mode === 'grammar' ? '英语' : `→ ${settings.targetLanguage}`}</span></div>
      <div className="textarea-shell"><textarea id="sentence-input" spellCheck={false} value={text} maxLength={12000} disabled={busy} placeholder={mode === 'grammar' ? '例如：She go to school every day.' : '例如：今天天气怎么样？'} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void analyze(); } }} /><div className="textarea-footer"><span>在这里输入，或粘贴你遇到的句子</span><span>{text.length.toLocaleString()} / 12,000</span></div></div>
      <div className="sample-row"><span>试试示例</span>{(mode === 'grammar' ? ['She go to school every day.', 'I am agree with you.'] : ['今天天气怎么样？', '谢谢你的耐心，我会尽快回复。']).map(sample => <button key={sample} disabled={busy} onClick={() => { setText(sample); setResult(null); setError(''); }}>{sample}<ArrowRight size={12} /></button>)}</div>
      <div className="composer-bottom"><span className="privacy-caption"><Leaf size={13} />只发送你主动提交的文字</span><button className="button primary" disabled={busy || !text.trim()} onClick={analyze} title="Ctrl + Enter">{busy ? <Spinner label="正在细读你的句子…" /> : <><Sparkles size={17} />{mode === 'grammar' ? '检查这句话' : '翻译这句话'}<span className="button-enter"><CornerDownLeft size={12} /></span></>}</button></div>
      {error && <div className="inline-error" role="alert"><CircleAlert size={18} /><div><strong>这次请求没有完成</strong><p>{error}</p><button className="text-button" onClick={onSettings}>检查模型设置<ArrowRight size={14} /></button></div></div>}
    </div>
    <div className={`card insight-card ${result ? 'has-result' : ''}`} aria-live="polite">
      {busy ? <div className="analysis-loading"><div className="orb"><Sparkles size={30} strokeWidth={1.4} /></div><span className="eyebrow">A MOMENT OF DISCOVERY</span><h3>{mode === 'grammar' ? '每个细节，都值得读懂。' : '为你的想法，找到恰当的表达。'}</h3><p>正在联系你配置的模型，请稍候。</p><div className="loading-bars"><span /><span /><span /></div></div> : result ? <><div className="insight-head"><span className="eyebrow">YOUR LANGUAGE NOTE</span><button className="icon-button" aria-label="清空结果" onClick={() => setResult(null)}><X size={16} /></button></div><ResultView result={result} notify={notify} compact /><div className="saved-note"><BookOpenCheck size={15} />{result.mode === 'grammar' && result.isCorrect && !result.issues.length && !settings.saveCorrectSentences ? '语法正确的句子未自动收藏，可在设置中开启。' : syncError ? '已保存到学习库；Markdown 同步需要处理，请查看顶部提示。' : '已整理到学习库与 Markdown 笔记。'}</div></> : <div className="intro-card"><div className="intro-card-top"><span className="eyebrow">YOUR EVERYDAY COMPANION</span><span className="mini-leaf"><Leaf size={18} /></span></div><h2>不只是改对，<br /><em>更要学会。</em></h2><p className="intro-description">知道为什么，下一次就能写得更好。<br />你的每一次练习，都会成为自己的积累。</p><div className="how-it-works"><div><span>01</span><div><strong>选中一句话</strong><p>邮件、网页、文档，随时开始。</p></div><MousePointer2 size={18} /></div><div><span>02</span><div><strong>按下快捷键，读懂修改</strong><p>指出具体错误，也解释背后的规则。</p></div><WandSparkles size={18} /></div><div><span>03</span><div><strong>留下笔记，适时复习</strong><p>让眼前的理解，变成长久的记忆。</p></div><BookOpenCheck size={18} /></div></div><div className="shortcut-guide"><span>全局语法纠错</span><Shortcut value={settings.grammarShortcut} /></div></div>}
    </div>
  </section>;
}

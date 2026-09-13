import { ArrowRight, BookOpen, Check, CircleAlert, Copy, Leaf, MousePointer2, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ResultEvent } from '../shared/types';
import { api, errorMessage } from './bridge';
import { ResultView, Spinner, TitleBar } from './components';

export function Popup() {
  const [event, setEvent] = useState<ResultEvent>({ status: 'loading', mode: 'grammar' });
  const [message, setMessage] = useState('');
  const [replacing, setReplacing] = useState(false);
  useEffect(() => api.onResult(value => { setEvent(value); setMessage(value.status === 'done' ? value.message || '' : ''); }), []);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') api.close(); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  const replace = async () => { setReplacing(true); try { const result = await api.replace(); setMessage(result.message); if (result.ok) setEvent(current => ({ ...current, canReplace: false, replaced: true })); } catch (e) { setMessage(errorMessage(e)); } finally { setReplacing(false); } };
  return <div className="popup-shell"><TitleBar popup /><main className="popup-content">
    {event.status === 'loading' ? <div className="popup-loading"><div className="orb"><Sparkles size={28} strokeWidth={1.4} /></div><span className="eyebrow">A MOMENT OF DISCOVERY</span><h2>{event.mode === 'grammar' ? '正在细读你的句子…' : '正在寻找恰当的表达…'}</h2>{event.original && <blockquote>{event.original}</blockquote>}<Spinner label="使用你配置的模型" /></div> : event.status === 'error' ? <div className="popup-error"><span><CircleAlert size={30} /></span><span className="eyebrow">LET’S TRY AGAIN</span><h2>这次没有完成</h2><p>{event.message || '无法处理选中的文字，请重新选择后再试。'}</p><button className="button primary" onClick={api.openMain}><Settings2 size={16} />打开应用，检查设置</button></div> : event.result ? <><div className="popup-original"><span className="eyebrow">YOU SELECTED</span><p>{event.result.original}</p></div><ResultView result={event.result} notify={text => setMessage(text)} compact />{event.replaced && <div className="popup-saved"><Check size={15} />已替换原应用中的选中文字</div>}{event.entryId && <div className="popup-saved"><BookOpen size={15} />已收录到你的学习库</div>}</> : null}
    {message && <div className="popup-message" role="status">{message}</div>}
  </main><footer className="popup-footer"><button className="text-button" onClick={api.openMain}><Leaf size={15} />回到学习空间</button><div>{event.status === 'done' && event.result && <button className="button secondary small" onClick={async () => { try { await api.copy(event.result!.corrected); setMessage('已复制到剪贴板'); } catch (e) { setMessage(errorMessage(e)); } }}><Copy size={15} />复制</button>}{event.canReplace && event.status === 'done' && <button className="button primary small" disabled={replacing} onClick={replace}>{replacing ? <Spinner label="替换中" /> : <><MousePointer2 size={15} />替换原文</>}</button>}</div></footer></div>;
}

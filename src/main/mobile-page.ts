import type { UiLanguage } from '../shared/types';
import { createTranslator, normalizeUiLanguage } from '../shared/i18n';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Page chrome only: learning content remains in its original saved language. */
export function renderMobilePage(language: UiLanguage = 'zh-CN'): string {
  language = normalizeUiLanguage(language);
  const t = createTranslator(language);
  const ui = {
    title: t("随身复习", "Pocket review"),
    tagline: t("每一句，都有新收获", "Learn something from every sentence"),
    connecting: t("正在连接", "Connecting"),
    pocket: t("随身学习", "YOUR POCKET PRACTICE"),
    heading: t("让进步，发生在今天。", "Make progress today."),
    loading: t("正在读取你的学习库…", "Loading your learning library…"),
    reviewTab: t("今日复习", "Today’s review"),
    libraryTab: t("句子收藏", "Saved sentences"),
    refresh: t("刷新学习库", "Refresh library"),
    search: t("搜索句子", "Search sentences"),
    searchPlaceholder: t("搜索句子、语法规则…", "Search sentences and grammar rules…"),
    syncNote: t("学习进度会自动保存到桌面。请保持 LingoLeaf 运行，并连接同一可信网络。电脑关机后可在同步目录中阅读 Markdown 笔记。", "Your progress is saved to the desktop. Keep LingoLeaf running on the same trusted network. When your computer is off, read Markdown notes in your synced folder."),
    languageNote: t("界面语言跟随桌面设置；更改后请重新加载本页。", "The interface follows your desktop language. Reload this page after changing it."),
    failed: t("连接失败", "Connection failed"),
    saveTimeout: t("未收到保存结果，请刷新确认复习状态后再操作。", "No save confirmation received. Refresh to check your review progress before trying again."),
    timeout: t("连接超时，请检查电脑是否运行并连接同一网络。", "Connection timed out. Check that your computer is running on the same network."),
    connected: t("● 已连接桌面", "● Connected to desktop"),
    disconnected: t("连接已断开", "Disconnected"),
    scanAgain: t("请在桌面打开「手机同步」，重新扫描二维码。", "Open Mobile sync on the desktop and scan the QR code again."),
    correction: t("正确表达", "Correction"),
    expression: t("建议表达", "Suggested expression"),
    translation: t("译文", "Translation"),
    meaning: t("句意", "Meaning"),
    context: t("表达场景", "Context"),
    tone: t("表达语气", "Tone"),
    grammar: t("语法", "Grammar"),
    style: t("表达建议", "Style suggestion"),
    structures: t("语法结构", "Grammar structures"),
    keyPoints: t("要点摘要", "Key takeaways"),
    alternatives: t("其他表达", "Alternative expressions"),
    clarification: t("可以再想一想", "Questions to consider"),
    example: t("举一反三", "Try another sentence"),
    conversation: t("追问与回答", "Questions and answers"),
    question: t("追问 {count}", "Question {count}"),
    desktopFollowup: t("在桌面打开此学习条目，可以继续追问。", "Open this entry on the desktop to ask another question."),
    grammarPrompt: t("找出语法问题", "Find the grammar issue"),
    translatePrompt: t("试着翻译", "Try translating"),
    readPrompt: t("理解句意和结构", "Understand the meaning and structure"),
    expressPrompt: t("试着表达你的意思", "Try expressing your idea"),
    recallPrompt: t("回忆这句话", "Recall this sentence"),
    summary: t("{total} 个句子已收藏 · {count} 个等待复习", "{total} saved sentences · {count} due for review"),
    remaining: t("还剩 {count} 句", "{count} sentences remaining"),
    thinkFirst: t("先想一想，再揭晓答案。", "Think first, then reveal the answer."),
    again: t("再学一次", "Again"),
    hard: t("有点难", "Hard"),
    good: t("记住了", "Good"),
    easy: t("很轻松", "Easy"),
    reveal: t("查看答案", "Reveal answer"),
    done: t("今日复习完成 ☀", "Today’s review is complete ☀"),
    start: t("从第一句话开始。", "Start with your first sentence."),
    dueNote: t("新句子和到期复习会出现在这里。", "New sentences and due reviews will appear here."),
    startNote: t("在电脑纠错、翻译、阅读解析或探索表达，然后在这里继续学习。", "Check grammar, translate, understand a passage, or explore wording on your computer, then keep learning here."),
    noResults: t("没有找到句子。", "No sentences found."),
    saved: t("复习进度已保存到桌面", "Review progress saved to desktop"),
    professional: t("专业 / 正式表达", "Professional / formal wording"),
    improvements: t("写作提升要点", "Writing improvements"),
  };
  return String.raw`<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#234b40"><meta name="apple-mobile-web-app-capable" content="yes"><title>LingoLeaf · ${escapeHtml(ui.title)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f7f6f1;color:#243b33;font:15px/1.7 system-ui,-apple-system,'Segoe UI',sans-serif}header{background:#234b40;color:#fff;padding:24px max(24px,calc((100vw - 740px)/2));display:flex;align-items:center;justify-content:space-between}.logo{font:26px Georgia,serif;letter-spacing:-1px}.label{font-size:12px;opacity:.7}main{max-width:740px;margin:auto;padding:28px 20px 60px}h1{font-size:29px;letter-spacing:-1px;margin:0}p{color:#6d7e72}.tabs{display:flex;gap:8px;margin:26px 0}button{border:0;border-radius:12px;padding:12px 18px;background:#e8ece5;color:#234b40;font:inherit;cursor:pointer}button.active,.primary{background:#234b40;color:white}button:focus-visible,input:focus-visible{outline:3px solid #deaa69;outline-offset:3px}.card{background:white;border:1px solid #e3e7de;padding:26px;border-radius:22px;margin:16px 0;box-shadow:0 8px 36px #243b3305}.sentence{font:25px/1.5 Georgia,'Microsoft YaHei',serif;overflow-wrap:anywhere;white-space:pre-wrap}.eyebrow{font-size:11px;letter-spacing:2px;color:#7b887e;text-transform:uppercase}.corrected{border-left:3px solid #82a68b;padding-left:18px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ratings button{flex:1;min-width:65px;padding:12px 9px}.muted{color:#7b887e;font-size:13px}.error{padding:16px;background:#fff1e9;border-radius:12px;color:#8b4024;white-space:pre-wrap}input{width:100%;border:1px solid #d9e0d6;padding:14px;border-radius:12px;background:white;font:inherit}mark{background:#fff0d6;color:inherit;padding:2px 5px}.tag{display:inline-block;background:#edf2eb;color:#607c67;padding:3px 10px;border-radius:8px;font-size:12px}.hidden{display:none}.full{width:100%;margin-top:20px}hr{border:0;border-top:1px solid #edf0e9;margin:22px 0}.empty{text-align:center;padding:30px 5px}#status{font-size:12px;color:#b4cbbc}.issue{border-top:1px solid #edf0e9;padding:15px 0}.toast{position:sticky;bottom:12px;background:#234b40;color:white;padding:12px 18px;border-radius:12px}.preserve-text{white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4}.meaning{margin:22px 0;padding:18px;background:#edf2eb;border-radius:12px}.meaning p{margin:8px 0 0;color:#314a40}::selection{background:#b8d9c8;color:#142f26}@media(forced-colors:active){::selection{background:Highlight;color:HighlightText}}</style></head>
<body><header><div><div class="logo">❧ LingoLeaf</div><div class="label">${escapeHtml(ui.tagline)}</div></div><span id="status">${escapeHtml(ui.connecting)}</span></header><main><div class="eyebrow">${escapeHtml(ui.pocket)}</div><h1>${escapeHtml(ui.heading)}</h1><p id="summary">${escapeHtml(ui.loading)}</p><div class="tabs"><button id="reviewTab" class="active">${escapeHtml(ui.reviewTab)}</button><button id="libraryTab">${escapeHtml(ui.libraryTab)}</button><button id="refresh" aria-label="${escapeHtml(ui.refresh)}">↻</button></div><div id="error" class="hidden error" role="alert"></div><section id="review"></section><section id="library" class="hidden"><input id="search" aria-label="${escapeHtml(ui.search)}" placeholder="${escapeHtml(ui.searchPlaceholder)}"><div id="items"></div></section><p class="muted">${escapeHtml(ui.syncNote)}</p><p class="muted">${escapeHtml(ui.languageNote)}</p><div id="toast" class="hidden toast" role="status"></div></main>
<script>
const ui=${scriptJson(ui)};
const message=(key,values={})=>ui[key].replace(/\{(\w+)\}/g,(match,name)=>values[name]===undefined?match:String(values[name]));
let token=location.hash.slice(1);try{token=token||sessionStorage.getItem('lingoleafToken')||'';if(token)sessionStorage.setItem('lingoleafToken',token)}catch{}if(token)history.replaceState(null,'',location.pathname);
let entries=[],revealedId=null,currentId=null,tab='review',busy=false,refreshing=false,clockOffset=0,toastTimer;
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function syncControls(){$('refresh').disabled=busy||refreshing;document.querySelectorAll('[data-rating],#reveal').forEach(b=>b.disabled=busy||refreshing)}
function syncClock(now){const value=Date.parse(now);if(Number.isFinite(value))clockOffset=value-Date.now()}
async function request(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||ui.failed);return data}catch(e){if(controller.signal.aborted)throw Error(body?ui.saveTimeout:ui.timeout);throw e}finally{clearTimeout(timer)}}
async function refresh(){if(busy||refreshing)return;refreshing=true;syncControls();try{const data=await request('/api/entries');entries=data.entries;syncClock(data.now);$('error').classList.add('hidden');$('status').textContent=ui.connected;render()}catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden');$('status').textContent=ui.disconnected;if(!entries.length)$('summary').textContent=ui.scanAgain}finally{refreshing=false;syncControls()}}
function due(){const now=Date.now()+clockOffset;return entries.filter(e=>Date.parse(e.review.dueAt)<=now).sort((a,b)=>a.review.dueAt.localeCompare(b.review.dueAt))}
function answer(e){return '<div class="corrected"><div class="eyebrow">'+esc(e.mode==='grammar'?ui.correction:e.mode==='express'?ui.expression:ui.translation)+(e.mode==='read'?' · '+esc(e.targetLanguage):'')+'</div><div class="sentence">'+esc(e.corrected)+'</div></div>'+
(e.mode==='grammar'&&e.translation?.trim()?'<section class="meaning"><div class="eyebrow">'+esc(ui.meaning)+(e.translationLanguage?' · '+esc(e.translationLanguage):'')+'</div><p class="preserve-text">'+esc(e.translation)+'</p></section>':'')+
(e.mode==='grammar'&&e.professional?'<section class="meaning professional"><h2>'+esc(ui.professional)+'</h2><p class="sentence">'+esc(e.professional.text)+'</p><p class="preserve-text">'+esc(e.professional.explanation)+'</p><h3>'+esc(ui.improvements)+'</h3><ul>'+e.professional.improvements.map(p=>'<li class="preserve-text">'+esc(p)+'</li>').join('')+'</ul></section>':'')+
(e.expressionContext?'<p class="preserve-text"><strong>'+esc(ui.context)+'</strong><br>'+esc(e.expressionContext)+'</p>':'')+
(e.expressionTone?'<p class="preserve-text"><strong>'+esc(ui.tone)+'</strong><br>'+esc(e.expressionTone)+'</p>':'')+
'<p class="preserve-text">'+esc(e.explanation)+'</p>'+e.issues.map(i=>'<div class="issue"><span class="tag">'+esc(i.kind==='grammar'?ui.grammar:ui.style)+' · '+esc(i.rule)+'</span><p class="preserve-text"><mark>'+esc(i.original)+'</mark> → '+esc(i.replacement)+'</p><div class="preserve-text">'+esc(i.explanation)+'</div></div>').join('')+
(e.grammarPoints?.length?'<section><hr><h2>'+esc(ui.structures)+'</h2>'+e.grammarPoints.map(p=>'<div class="issue"><div class="preserve-text"><strong>'+esc(p.text)+'</strong></div><p class="preserve-text">'+esc(p.explanation)+'</p></div>').join('')+'</section>':'')+
(e.keyPoints?.length?'<section><hr><h2>'+esc(ui.keyPoints)+'</h2><ul>'+e.keyPoints.map(p=>'<li class="preserve-text">'+esc(p)+'</li>').join('')+'</ul></section>':'')+
(e.alternatives?.length?'<section><hr><h2>'+esc(ui.alternatives)+'</h2>'+e.alternatives.map(a=>'<div class="issue"><span class="tag">'+esc(a.tone)+'</span><p class="sentence">'+esc(a.text)+'</p><p class="preserve-text">'+esc(a.explanation)+'</p></div>').join('')+'</section>':'')+
(e.clarificationQuestions?.length?'<section><hr><h2>'+esc(ui.clarification)+'</h2><ul>'+e.clarificationQuestions.map(q=>'<li class="preserve-text">'+esc(q)+'</li>').join('')+'</ul></section>':'')+
(e.example?'<hr><div class="eyebrow">'+esc(ui.example)+'</div><p class="preserve-text">'+esc(e.example)+'</p>':'')+
(e.conversation?.length?'<section><hr><h2>'+esc(ui.conversation)+'</h2>'+e.conversation.map((t,i)=>'<article class="issue"><h3>'+esc(message('question',{count:i+1}))+'</h3><div class="preserve-text"><strong>'+esc(t.question)+'</strong></div><p class="preserve-text">'+esc(t.answer)+'</p><div class="muted">'+esc(t.createdAt)+'</div></article>').join('')+'<p class="muted">'+esc(ui.desktopFollowup)+'</p></section>':'')}
function reviewPrompt(e){return ({grammar:ui.grammarPrompt,translate:ui.translatePrompt,read:ui.readPrompt,express:ui.expressPrompt})[e.mode]||ui.recallPrompt}
function render(includeItems=true){const queue=due();$('summary').textContent=message('summary',{total:entries.length,count:queue.length});const e=queue.find(item=>item.id===currentId)||queue[0];currentId=e?.id||null;$('review').innerHTML=e?'<article class="card"><div class="row"><span class="tag">'+esc(reviewPrompt(e))+'</span><span class="muted">'+esc(message('remaining',{count:queue.length}))+'</span></div><p class="sentence">'+esc(e.original)+'</p><p class="muted">'+esc(ui.thinkFirst)+'</p>'+(revealedId===e.id?'<hr>'+answer(e)+'<hr><div class="ratings row"><button data-rating="again">'+esc(ui.again)+'</button><button data-rating="hard">'+esc(ui.hard)+'</button><button data-rating="good">'+esc(ui.good)+'</button><button data-rating="easy">'+esc(ui.easy)+'</button></div>':'<button class="primary full" id="reveal">'+esc(ui.reveal)+'</button>')+'</article>':'<article class="card empty"><div class="sentence">'+esc(entries.length?ui.done:ui.start)+'</div><p>'+esc(entries.length?ui.dueNote:ui.startNote)+'</p></article>';
if($('reveal'))$('reveal').onclick=()=>{if(busy||refreshing)return;revealedId=e.id;render(false)};document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>rate(e.id,b.dataset.rating));if(includeItems)renderItems();syncControls()}
function searchable(e){return [e.original,e.corrected,e.translation,e.explanation,e.professional?.text,e.professional?.explanation,...(e.professional?.improvements||[]),e.expressionContext,e.expressionTone,...e.tags,...e.issues.map(i=>i.rule),...(e.grammarPoints||[]).flatMap(p=>[p.text,p.explanation]),...(e.keyPoints||[]),...(e.alternatives||[]).flatMap(a=>[a.text,a.tone,a.explanation]),...(e.clarificationQuestions||[]),...(e.conversation||[]).flatMap(t=>[t.question,t.answer])].filter(Boolean).join(' ').toLowerCase()}
function renderItems(){const q=$('search').value.toLowerCase();const list=entries.filter(e=>searchable(e).includes(q));$('items').innerHTML=list.length?list.map(e=>'<details class="card"><summary class="sentence">'+esc(e.original)+'</summary><hr>'+answer(e)+'</details>').join(''):'<p class="empty muted">'+esc(ui.noResults)+'</p>'}
async function rate(id,rating){if(busy||refreshing)return;busy=true;syncControls();try{const data=await request('/api/review',{id,rating});entries=entries.map(e=>e.id===id?data.entry:e);syncClock(data.now);currentId=null;revealedId=null;$('error').classList.add('hidden');$('status').textContent=ui.connected;render();$('toast').textContent=ui.saved;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),2200)}catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden')}finally{busy=false;syncControls()}}
function switchTab(next){tab=next;$('review').classList.toggle('hidden',tab!=='review');$('library').classList.toggle('hidden',tab!=='library');$('reviewTab').classList.toggle('active',tab==='review');$('libraryTab').classList.toggle('active',tab==='library');if(tab==='review'&&!busy&&!refreshing)render(false)}
$('reviewTab').onclick=()=>switchTab('review');$('libraryTab').onclick=()=>switchTab('library');$('refresh').onclick=refresh;$('search').oninput=renderItems;document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});setInterval(()=>{if(!document.hidden&&!busy&&!refreshing)render(false)},15000);refresh();
</script></body></html>`;
}

export const MOBILE_HTML = renderMobilePage();

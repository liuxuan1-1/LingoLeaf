import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  Flower2,
  FolderOpen,
  Leaf,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftClose,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  Sprout,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState, Entry, ExpressionOptions, Mode, Settings } from '../shared/types';
import { api, errorMessage, isPreview } from './bridge';
import { Brand, EmptyState, SectionHeading, Shortcut, TitleBar, type Notify } from './components';
import { Workbench } from './Workbench';
import { Library } from './Library';
import { ReviewPage } from './Review';
import { SettingsPage } from './Settings';
import { MobilePage } from './Mobile';
import { MODE_INFO } from './modes';

export type Page = 'workbench' | 'library' | 'review' | 'mobile' | 'settings';
export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [fatal, setFatal] = useState('');
  const [page, setPage] = useState<Page>('workbench');
  const [toast, setToast] = useState<{ message: string; kind: string; id: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [initialText, setInitialText] = useState<{ text: string; mode: Mode; key: number; options?: ExpressionOptions } | null>(
    null,
  );
  const [now, setNow] = useState(Date.now());
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const notify: Notify = useCallback(
    (message, kind = 'success') => setToast({ message, kind, id: Date.now() }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setState(await api.getState());
      setFatal('');
    } catch (e) {
      setFatal(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    return api.onChanged(() => void refresh());
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 9000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setMenuOpen(false);
    document.querySelector('.main-scroll')?.scrollTo(0, 0);
  }, [page]);
  const due = useMemo(
    () => state?.entries.filter((entry) => new Date(entry.review.dueAt).getTime() <= now) || [],
    [state, now],
  );
  const reviewedToday = useMemo(
    () =>
      state?.entries.filter(
        (entry) =>
          entry.review.lastReviewedAt &&
          new Date(entry.review.lastReviewedAt).toDateString() === new Date(now).toDateString(),
      ).length || 0,
    [state, now],
  );
  const updateEntry = (updated: Entry) =>
    setState((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) => (entry.id === updated.id ? updated : entry)),
          }
        : current,
    );
  const exportNotes = async () => {
    try {
      const path = await api.exportLibrary();
      if (path) notify(`学习笔记已导出至 ${path}`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };
  const goPractice = (text?: string, mode: Mode = 'grammar', options?: ExpressionOptions) => {
    if (text) setInitialText({ text, mode, key: Date.now(), options });
    setPage('workbench');
  };
  if (!state)
    return (
      <div className="startup">
        <TitleBar />
        <div>
          <span className="startup-logo">
            <Leaf size={38} />
          </span>
          <h1>
            LingoLeaf<span>.</span>
          </h1>
          {fatal ? (
            <>
              <p className="error-text">{fatal}</p>
              <button className="button primary" onClick={refresh}>
                重新载入
              </button>
            </>
          ) : (
            <p className="loading-inline">
              <LoaderCircle className="spin" size={18} />
              正在打开你的学习空间…
            </p>
          )}
        </div>
      </div>
    );
  const navItems = [
    { id: 'workbench', icon: Sparkles, label: '句子工作台', hint: 'Practice' },
    { id: 'library', icon: BookOpen, label: '我的学习库', hint: 'Library' },
    { id: 'review', icon: Flower2, label: '温故知新', hint: 'Review' },
    { id: 'mobile', icon: Smartphone, label: '随身学习', hint: 'On the go' },
  ] as const;
  const configured =
    Boolean(state.settings.model.trim()) &&
    (state.settings.provider === 'ollama' ||
      state.settings.provider === 'compatible' ||
      state.settings.hasApiKey);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Brand />
        <div className="sidebar-intro">
          YOUR WORDS,
          <br />
          <em>growing.</em>
          <span className="intro-dot" />
        </div>
        <div className="nav-label">你的学习空间</div>
        <nav aria-label="主要导航">
          {navItems.map(({ id, icon: Icon, label, hint }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.65} />
              <span>
                {label}
                <small>{hint}</small>
              </span>
              {id === 'review' && due.length > 0 && <b className="nav-count">{due.length}</b>}
              {id === page && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={22} strokeWidth={1.45} />
            <p>
              每天一点点，
              <br />
              让表达成为你的直觉。
            </p>
            <span>ONE SENTENCE AT A TIME</span>
          </div>
          <button
            className={`nav-item settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            <Settings2 size={19} strokeWidth={1.6} />
            <span>偏好设置</span>
            <span className="version">v{state.version}</span>
          </button>
          <div className="local-note">
            <span />
            本地笔记 · 由你掌握
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="关闭导航菜单"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="main-shell">
        <TitleBar />
        <div className="mobile-bar">
          <button
            className="icon-button"
            aria-label="展开导航"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <PanelLeftClose size={21} />
          </button>
          <Brand compact />
          <button className="icon-button" aria-label="偏好设置" onClick={() => setPage('settings')}>
            <Settings2 size={20} />
          </button>
        </div>
        <main className="main-scroll">
          {isPreview && (
            <div className="preview-banner">
              <CircleAlert size={15} />
              浏览器界面预览 · 模型调用、笔记保存和系统快捷键需要 Windows 桌面应用
            </div>
          )}
          {state.syncError && (
            <div className="sync-warning" role="alert">
              <CircleAlert size={16} />
              <div>Markdown 文件与应用记录暂未同步：{state.syncError}</div>
            </div>
          )}
          {fatal && (
            <div className="inline-error" role="alert">
              {fatal}
              <button className="text-button" onClick={refresh}>
                重试
              </button>
            </div>
          )}
          <div className="page-content">
            {page === 'workbench' && (
              <>
                <SectionHeading
                  eyebrow="MAKE YOURSELF UNDERSTOOD"
                  title="让每句话，长出新知。"
                  description="纠正一个细节，学会一种表达。把日常，变成你的语言课堂。"
                  action={
                    <span className="date-badge">
                      <span />
                      {new Date().toLocaleDateString('zh-CN', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                      })}
                    </span>
                  }
                />
                <div className="stats-grid">
                  <button className="stat-card" onClick={() => setPage('library')}>
                    <span className="stat-icon mint">
                      <BookOpen size={20} />
                    </span>
                    <div>
                      <span>积累的句子</span>
                      <strong>
                        {state.entries.length}
                        <small>句</small>
                      </strong>
                    </div>
                    <ArrowUpRight className="stat-arrow" size={17} />
                  </button>
                  <button className="stat-card" onClick={() => setPage('review')}>
                    <span className="stat-icon peach">
                      <Clock3 size={20} />
                    </span>
                    <div>
                      <span>等待温习</span>
                      <strong>
                        {due.length}
                        <small>句</small>
                      </strong>
                    </div>
                    <ArrowUpRight className="stat-arrow" size={17} />
                  </button>
                  <div className="stat-card">
                    <span className="stat-icon lavender">
                      <Check size={21} />
                    </span>
                    <div>
                      <span>今天已复习</span>
                      <strong>
                        {reviewedToday}
                        <small>句</small>
                      </strong>
                    </div>
                    <span className="stat-caption">Every little counts.</span>
                  </div>
                </div>
                {!configured && (
                  <button className="setup-banner" onClick={() => setPage('settings')}>
                    <span className="setup-icon">
                      <Sparkles size={19} />
                    </span>
                    <span>
                      <strong>连接你的 AI，开始第一句练习</strong>
                      <small>支持 OpenAI、Claude、Azure 和本地模型；密钥保存在你的电脑。</small>
                    </span>
                    <span className="setup-link">
                      设置模型
                      <ArrowRight size={16} />
                    </span>
                  </button>
                )}
                <Workbench
                  settings={state.settings}
                  notify={notify}
                  onSettings={() => setPage('settings')}
                  initial={initialText}
                  onDone={refresh}
                  syncError={state.syncError}
                />
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">GROW YOUR COLLECTION</span>
                    <h2>最近的积累</h2>
                  </div>
                  <button className="text-button" onClick={() => setPage('library')}>
                    查看学习库
                    <ArrowRight size={15} />
                  </button>
                </div>
                {state.entries.length ? (
                  <div className="recent-grid">
                    {[...state.entries]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 3)
                      .map((entry) => (
                        <button
                          className="recent-card"
                          key={entry.id}
                          onClick={() => goPractice(entry.original, entry.mode, { context: entry.expressionContext, tone: entry.expressionTone })}
                        >
                          <div>
                            <span className={`tag ${entry.mode === 'translate' ? 'amber' : ''}`}>
                              {MODE_INFO[entry.mode].short}
                            </span>
                            <ArrowUpRight size={16} />
                          </div>
                          <p>{entry.corrected}</p>
                          <small>{entry.tags.slice(0, 2).join(' · ') || '日常表达'}</small>
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="recent-empty">
                    <span>
                      <Sprout size={23} strokeWidth={1.5} />
                    </span>
                    <div>
                      <strong>你的第一片语叶，从一句话开始</strong>
                      <p>完成练习后，保存的学习笔记会出现在这里。</p>
                    </div>
                    <span className="decorative-line" />
                  </div>
                )}
                <footer className="page-footer">
                  <span>Small practice. Lasting progress.</span>
                  <button
                    onClick={() =>
                      void api.openLibrary().catch((e) => notify(errorMessage(e), 'error'))
                    }
                  >
                    <FolderOpen size={14} />
                    打开笔记文件夹
                  </button>
                </footer>
              </>
            )}
            {page === 'library' && (
              <Library
                entries={state.entries}
                notify={notify}
                onPractice={goPractice}
                onReview={() => setPage('review')}
                onExport={exportNotes}
                refresh={refresh}
              />
            )}
            {page === 'review' && (
              <ReviewPage
                entries={state.entries}
                notify={notify}
                updateEntry={updateEntry}
                onPractice={() => setPage('workbench')}
                now={now}
              />
            )}
            {page === 'settings' && (
              <SettingsPage
                settings={state.settings}
                initialDraft={settingsDraft}
                onDraft={setSettingsDraft}
                shortcuts={state.shortcuts}
                notify={notify}
                onSaved={(settings) => {
                  setSettingsDraft(null);
                  setState((current) => (current ? { ...current, settings } : current));
                }}
                refresh={refresh}
              />
            )}
            {page === 'mobile' && (
              <MobilePage
                settings={state.settings}
                notify={notify}
                onSettings={() => setPage('settings')}
                onExport={exportNotes}
              />
            )}
          </div>
        </main>
      </div>
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'error' ? <CircleAlert size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

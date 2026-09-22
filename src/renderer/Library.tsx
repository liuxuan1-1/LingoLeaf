import { useI18n } from './i18n';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Clock3,
  Search,
  Sprout,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry, ExpressionOptions, Mode } from '../shared/types';
import { api, errorMessage } from './bridge';
import { entrySearchText, getModeInfo, MODES } from './modes';
import {
  EmptyState,
  formatDate,
  Modal,
  ResultView,
  SectionHeading,
  type Notify,
} from './components';

export function Library({
  entries,
  notify,
  onPractice,
  onReview,
  onExport,
  refresh,
}: {
  entries: Entry[];
  notify: Notify;
  onPractice: (text?: string, mode?: Mode, options?: ExpressionOptions) => void;
  onReview: () => void;
  onExport: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const { language, t } = useI18n();
  const modeInfo = getModeInfo(language);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [limit, setLimit] = useState(18);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        selected ||
        deleteTarget
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [selected, deleteTarget]);
  const tags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort(),
    [entries],
  );
  const filtered = useMemo(
    () =>
      entries
        .filter((entry) => {
          const matchesMode =
            filter === 'all' ||
            entry.mode === filter ||
            (filter === 'due' && new Date(entry.review.dueAt).getTime() <= Date.now());
          const searchable = entrySearchText(entry);
          return (
            matchesMode &&
            (!tag || entry.tags.includes(tag)) &&
            searchable.includes(query.trim().toLowerCase())
          );
        })
        .sort((a, b) =>
          sort === 'due'
            ? a.review.dueAt.localeCompare(b.review.dueAt)
            : b.createdAt.localeCompare(a.createdAt),
        ),
    [entries, filter, query, tag, sort],
  );
  const deleteEntry = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteEntry(deleteTarget.id);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await refresh();
      notify(t("这条学习笔记已删除。", "Learning note deleted."));
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <SectionHeading
        eyebrow={t("收集每一次发现", "A COLLECTION OF SMALL DISCOVERIES")}
        title={t("我的学习库", "My library")}
        description={t("把遇见的表达留下来。每一条笔记，都是下一次进步的起点。", "Keep the expressions you discover. Every note is a starting point for progress.")}
        action={
          <button className="button secondary" onClick={onExport}>
            <ArrowDownToLine size={17} />
            {t("导出 Markdown", "Export Markdown")}
          </button>
        }
      />
      <div className="library-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            ref={searchRef}
            aria-label={t("搜索学习笔记", "Search learning notes")}
            placeholder={t("搜索句子、语法、要点、追问…", "Search sentences, grammar, key points, follow-ups…")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(18);
            }}
          />
          <kbd>/</kbd>
        </div>
        <select
          className="select-control"
          aria-label={t("按标签筛选", "Filter by tag")}
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setLimit(18);
          }}
        >
          <option value="">{t("所有标签", "All tags")}</option>
          {tags.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="select-control"
          aria-label={t("排序方式", "Sort order")}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">{t("最近添加", "Newest first")}</option>
          <option value="due">{t("优先复习", "Review due first")}</option>
        </select>
      </div>
      <div className="library-filter-row">
        <div className="filter-tabs">
          {[
            { id: 'all', label: t("全部积累", "All notes") },
            ...MODES.map((mode) => ({ id: mode, label: modeInfo[mode].label })),
            { id: 'due', label: t("待复习", "Due for review") },
          ].map((item) => (
            <button
              className={filter === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => {
                setFilter(item.id);
                setLimit(18);
              }}
            >
              {item.label}
              {item.id === 'all' && <span>{entries.length}</span>}
            </button>
          ))}
        </div>
        <span className="results-count">{t('共 {count} 条笔记', '{count} notes', { count: filtered.length })}</span>
      </div>
      {!entries.length ? (
        <div className="card">
          <EmptyState
            icon={<Sprout size={34} strokeWidth={1.4} />}
            title={t("给你的学习库，种下第一句话", "Start your library with one sentence")}
            description={t("在工作台纠错、翻译、阅读解析或组织想法。需要保存的结果会自动收录，并生成 Markdown 笔记。", "Improve writing, understand a text or express an idea in Practice. Saved results are added to your library and written to Markdown.")}
            action={
              <button className="button primary" onClick={() => onPractice()}>
                {t("开始第一句练习", "Start practicing")}
                <ArrowRight size={16} />
              </button>
            }
          />
        </div>
      ) : !filtered.length ? (
        <div className="card">
          <EmptyState
            icon={<Search size={30} />}
            title={t("没有找到相符的笔记", "No matching notes")}
            description={t("换一个关键词，或清除筛选条件再试试。", "Try another keyword or clear the filters.")}
            action={
              <button
                className="button secondary"
                onClick={() => {
                  setQuery('');
                  setTag('');
                  setFilter('all');
                }}
              >
                {t("清除筛选", "Clear filters")}
              </button>
            }
          />
        </div>
      ) : (
        <div className="library-grid">
          {filtered.slice(0, limit).map((entry) => {
            const Icon = modeInfo[entry.mode].icon;
            return (
            <article className="note-card" key={entry.id}>
              <button className="note-open" onClick={() => setSelected(entry)}>
                <div className="note-top">
                  <span className={`note-kind ${entry.mode}`}>
                    <Icon size={15} />
                    {modeInfo[entry.mode].note}
                  </span>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt, language)}</time>
                </div>
                <p className="note-original">{entry.original}</p>
                <div className="note-divider">
                  <ArrowRight size={14} />
                </div>
                <p className="note-corrected">{entry.corrected}</p>
                <div className="tags">
                  {entry.tags.slice(0, 3).map((value) => (
                    <span className="tag neutral" key={value}>
                      #{value}
                    </span>
                  ))}
                </div>
              </button>
              <div className="note-footer">
                <span
                  className={
                    new Date(entry.review.dueAt).getTime() <= Date.now() ? 'due-label' : ''
                  }
                >
                  <Clock3 size={13} />
                  {new Date(entry.review.dueAt).getTime() <= Date.now()
                    ? t("该温习了", "Ready to review")
                    : t('{date}复习', 'Review {date}', { date: formatDate(entry.review.dueAt, language) })}
                </span>
                <button
                  className="icon-button"
                  aria-label={t('删除笔记：{text}', 'Delete note: {text}', { text: entry.original })}
                  title={t("删除笔记", "Delete note")}
                  onClick={() => setDeleteTarget(entry)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ); })}
        </div>
      )}
      {filtered.length > limit && (
        <div className="load-more">
          <button className="button secondary" onClick={() => setLimit((value) => value + 18)}>
            {t("再看 18 条笔记", "Show 18 more notes")}
          </button>
        </div>
      )}
      {entries.length > 0 && (
        <div className="library-bottom">
          <BookOpen size={17} />
          <p>{t("这些句子，也值得再见一面。", "These sentences are worth another look.")}</p>
          <button className="text-button" onClick={onReview}>
            {t("去复习", "Start reviewing")}
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {selected && (
        <Modal title={t("一条属于你的语言笔记", "Your language note")} onClose={() => setSelected(null)}>
          <div className="modal-original">
            <span className="eyebrow">{t("你的原句", "YOUR ORIGINAL SENTENCE")}</span>
            <p className="text-content">{selected.original}</p>
          </div>
          <ResultView result={selected} notify={notify} />
          <div className="modal-footer">
            <span>
              {t('添加于 {date} · 已复习 {count} 次', 'Added {date} · Reviewed {count} times', { date: formatDate(selected.createdAt, language), count: selected.review.repetitions })}
            </span>
            <button
              className="button secondary"
              onClick={() => {
                onPractice(selected.original, selected.mode, { context: selected.expressionContext, tone: selected.expressionTone });
                setSelected(null);
              }}
            >
              {t("再练一次", "Practice again")}
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title={t("删除这条学习笔记？", "Delete this learning note?")} onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="confirm-content">
            <p>{t("对应的学习记录和 Markdown 笔记会一并删除，此操作无法在应用内撤销。", "The learning record and its Markdown note will both be deleted. This cannot be undone in the app.")}</p>
            <blockquote className="text-content">{deleteTarget.original}</blockquote>
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("保留笔记", "Keep note")}
            </button>
            <button className="button danger" disabled={deleting} onClick={deleteEntry}>
              {deleting ? t("正在删除…", "Deleting…") : t("删除笔记", "Delete note")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

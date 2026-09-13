import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Clock3,
  Languages,
  Search,
  Sprout,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry, Mode } from '../shared/types';
import { api, errorMessage } from './bridge';
import {
  CopyButton,
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
  onPractice: (text?: string, mode?: Mode) => void;
  onReview: () => void;
  onExport: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
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
          const searchable = [
            entry.original,
            entry.corrected,
            entry.explanation,
            ...entry.tags,
            ...entry.issues.map((issue) => issue.rule),
          ]
            .join(' ')
            .toLowerCase();
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
      notify('这条学习笔记已删除。');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <SectionHeading
        eyebrow="A COLLECTION OF SMALL DISCOVERIES"
        title="我的学习库"
        description="把遇见的表达留下来。每一条笔记，都是下一次进步的起点。"
        action={
          <button className="button secondary" onClick={onExport}>
            <ArrowDownToLine size={17} />
            导出 Markdown
          </button>
        }
      />
      <div className="library-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            ref={searchRef}
            aria-label="搜索学习笔记"
            placeholder="搜索句子、语法规则、标签…"
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
          aria-label="按标签筛选"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setLimit(18);
          }}
        >
          <option value="">所有标签</option>
          {tags.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="select-control"
          aria-label="排序方式"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">最近添加</option>
          <option value="due">优先复习</option>
        </select>
      </div>
      <div className="library-filter-row">
        <div className="filter-tabs">
          {[
            { id: 'all', label: '全部积累' },
            { id: 'grammar', label: '语法纠错' },
            { id: 'translate', label: '翻译表达' },
            { id: 'due', label: '待复习' },
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
        <span className="results-count">共 {filtered.length} 条笔记</span>
      </div>
      {!entries.length ? (
        <div className="card">
          <EmptyState
            icon={<Sprout size={34} strokeWidth={1.4} />}
            title="给你的学习库，种下第一句话"
            description="在工作台检查语法、翻译文字，或在其他应用中选中文字后按下快捷键。需要保存的结果会自动收录，并生成 Markdown 笔记。"
            action={
              <button className="button primary" onClick={() => onPractice()}>
                开始第一句练习
                <ArrowRight size={16} />
              </button>
            }
          />
        </div>
      ) : !filtered.length ? (
        <div className="card">
          <EmptyState
            icon={<Search size={30} />}
            title="没有找到相符的笔记"
            description="换一个关键词，或清除筛选条件再试试。"
            action={
              <button
                className="button secondary"
                onClick={() => {
                  setQuery('');
                  setTag('');
                  setFilter('all');
                }}
              >
                清除筛选
              </button>
            }
          />
        </div>
      ) : (
        <div className="library-grid">
          {filtered.slice(0, limit).map((entry) => (
            <article className="note-card" key={entry.id}>
              <button className="note-open" onClick={() => setSelected(entry)}>
                <div className="note-top">
                  <span className={`note-kind ${entry.mode}`}>
                    {entry.mode === 'grammar' ? (
                      <WandSparkles size={14} />
                    ) : (
                      <Languages size={15} />
                    )}
                    {entry.mode === 'grammar' ? '语法笔记' : '翻译笔记'}
                  </span>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
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
                    ? '该温习了'
                    : `${formatDate(entry.review.dueAt)}复习`}
                </span>
                <button
                  className="icon-button"
                  aria-label={`删除笔记：${entry.original}`}
                  title="删除笔记"
                  onClick={() => setDeleteTarget(entry)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {filtered.length > limit && (
        <div className="load-more">
          <button className="button secondary" onClick={() => setLimit((value) => value + 18)}>
            再看 18 条笔记
          </button>
        </div>
      )}
      {entries.length > 0 && (
        <div className="library-bottom">
          <BookOpen size={17} />
          <p>这些句子，也值得再见一面。</p>
          <button className="text-button" onClick={onReview}>
            去复习
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {selected && (
        <Modal title="一条属于你的语言笔记" onClose={() => setSelected(null)}>
          <div className="modal-original">
            <span className="eyebrow">YOUR ORIGINAL SENTENCE</span>
            <p>{selected.original}</p>
          </div>
          <ResultView result={selected} notify={notify} />
          <div className="modal-footer">
            <span>
              添加于 {formatDate(selected.createdAt)} · 已复习 {selected.review.repetitions} 次
            </span>
            <button
              className="button secondary"
              onClick={() => {
                onPractice(selected.original, selected.mode);
                setSelected(null);
              }}
            >
              再练一次
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="删除这条学习笔记？" onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="confirm-content">
            <p>对应的学习记录和 Markdown 笔记会一并删除，此操作无法在应用内撤销。</p>
            <blockquote>{deleteTarget.original}</blockquote>
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              保留笔记
            </button>
            <button className="button danger" disabled={deleting} onClick={deleteEntry}>
              {deleting ? '正在删除…' : '删除笔记'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { Check, CheckCheck, ChevronRight, Copy, Leaf, LoaderCircle, Minus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Analysis } from '../shared/types';
import { api, errorMessage } from './bridge';

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
}: {
  result: Analysis;
  notify?: Notify;
  compact?: boolean;
}) {
  const isTranslate = result.mode === 'translate';
  const grammarIssues = result.issues.filter((issue) => issue.kind === 'grammar');
  return (
    <div className={`result-view ${compact ? 'result-compact' : ''}`}>
      <div className="result-status">
        <span className={`result-check ${!isTranslate && !result.isCorrect ? 'needs-work' : ''}`}>
          <CheckCheck size={20} />
        </span>
        <div>
          <h3>
            {isTranslate
              ? '让表达，跨越语言'
              : result.isCorrect
                ? '这句话，语法没有错误'
                : `发现 ${grammarIssues.length || result.issues.length || 1} 处可以改进的语法`}
          </h3>
          <span>
            {isTranslate ? 'TRANSLATION' : result.isCorrect ? 'LOOKING GOOD' : 'A CHANCE TO GROW'}
          </span>
        </div>
      </div>
      <div className="result-sentence">
        <div className="field-topline">
          <span>{isTranslate ? '译文' : '建议表达'}</span>
          <CopyButton text={result.corrected} notify={notify} />
        </div>
        <p lang={isTranslate ? undefined : 'en'}>{result.corrected}</p>
      </div>
      {result.explanation && <p className="result-explanation">{result.explanation}</p>}
      {result.issues.length > 0 && (
        <div className="issues">
          <div className="section-label">
            理解每一个改变 <span>{result.issues.length}</span>
          </div>
          {result.issues.map((issue, i) => (
            <article className="issue" key={i}>
              <div className="issue-header">
                <span className="issue-number">{String(i + 1).padStart(2, '0')}</span>
                <strong>
                  {issue.rule || (issue.kind === 'grammar' ? '语法修改' : '表达建议')}
                </strong>
                <span className={`tag ${issue.kind === 'style' ? 'neutral' : 'amber'}`}>
                  {issue.kind === 'style' ? '风格建议' : '语法'}
                </span>
              </div>
              <div className="issue-diff">
                <del>{issue.original || '（省略）'}</del>
                <ChevronRight size={14} />
                <ins>{issue.replacement || '（删除）'}</ins>
              </div>
              <p>{issue.explanation}</p>
            </article>
          ))}
        </div>
      )}
      {result.example && (
        <div className="example-block">
          <span className="eyebrow">TRY ANOTHER SENTENCE</span>
          <p>{result.example}</p>
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
    </div>
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

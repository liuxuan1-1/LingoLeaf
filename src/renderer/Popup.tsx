import { useI18n } from './i18n';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Copy,
  Leaf,
  MousePointer2,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Mode, ResultEvent } from '../shared/types';
import { api, errorMessage } from './bridge';
import { ResultView, Spinner, TitleBar } from './components';

export function Popup() {
  const { t } = useI18n();
  const [event, setEvent] = useState<ResultEvent>({ status: 'loading', mode: 'grammar' });
  const [message, setMessage] = useState('');
  const [replacing, setReplacing] = useState(false);
  const loadingLabels = {
    grammar: t("正在细读你的句子…", "Reading your sentence closely…"),
    translate: t("正在寻找恰当的译文…", "Finding the right translation…"),
    read: t("正在翻译并拆解语法…", "Translating and unpacking the grammar…"),
    express: t("正在组织你的想法…", "Putting your ideas into words…"),
  } satisfies Record<Mode, string>;
  useEffect(
    () =>
      api.onResult((value) => {
        setEvent(value);
        setMessage(value.status === 'done' ? value.message || '' : '');
      }),
    [],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api.close();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const replace = async () => {
    setReplacing(true);
    try {
      const result = await api.replace();
      setMessage(result.message);
      if (result.ok) setEvent((current) => ({ ...current, canReplace: false, replaced: true }));
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setReplacing(false);
    }
  };
  return (
    <div className="popup-shell">
      <TitleBar popup />
      <main className="popup-content">
        {event.status === 'loading' ? (
          <div className="popup-loading">
            <div className="orb">
              <Sparkles size={28} strokeWidth={1.4} />
            </div>
            <span className="eyebrow">{t("新知即将到来", "A MOMENT OF DISCOVERY")}</span>
            <h2>{loadingLabels[event.mode]}</h2>
            {event.original && (
              <blockquote
                className={`text-content${/[\r\n]/.test(event.original) ? ' text-multiline' : ''}`}
              >
                {event.original}
              </blockquote>
            )}
            <Spinner label={t("使用你配置的模型", "Using your configured model")} />
          </div>
        ) : event.status === 'error' ? (
          <div className="popup-error">
            <span>
              <CircleAlert size={30} />
            </span>
            <span className="eyebrow">{t("再试一次", "LET’S TRY AGAIN")}</span>
            <h2>{t("这次没有完成", "This attempt did not finish")}</h2>
            <p>{event.message || t("无法处理选中的文字，请重新选择后再试。", "Could not process the selected text. Select it again and retry.")}</p>
            <button className="button primary" onClick={api.openMain}>
              <Settings2 size={16} />
              {t("打开应用，检查设置", "Open app and check settings")}
            </button>
          </div>
        ) : event.result ? (
          <>
            <div className="popup-original">
              <span className="eyebrow">{t("你选中的文字", "YOU SELECTED")}</span>
              <p className="text-content">{event.result.original}</p>
            </div>
            <ResultView result={event.result} entryId={event.entryId} notify={(text) => setMessage(text)} compact />
            {event.replaced && (
              <div className="popup-saved">
                <Check size={15} />
                {t("已替换原应用中的选中文字", "Selected text replaced in the original app")}
              </div>
            )}
            {event.entryId && (
              <div className="popup-saved">
                <BookOpen size={15} />
                {t("已收录到你的学习库", "Added to your library")}
              </div>
            )}
          </>
        ) : null}
        {message && (
          <div className="popup-message" role="status">
            {message}
          </div>
        )}
      </main>
      <footer className="popup-footer">
        <button className="text-button" onClick={api.openMain}>
          <Leaf size={15} />
          {t("回到学习空间", "Back to your learning space")}
        </button>
        <div>
          {event.status === 'done' && event.result && (
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  await api.copy(event.result!.corrected);
                  setMessage(t("已复制到剪贴板", "Copied to clipboard"));
                } catch (e) {
                  setMessage(errorMessage(e));
                }
              }}
            >
              <Copy size={15} />
              {t("复制", "Copy")}
            </button>
          )}
          {event.canReplace && event.status === 'done' && (
            <button className="button primary small" disabled={replacing} onClick={replace}>
              {replacing ? (
                <Spinner label={t("替换中", "Replacing")} />
              ) : (
                <>
                  <MousePointer2 size={15} />
                  {t("替换原文", "Replace original")}
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

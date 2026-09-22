import { useI18n } from './i18n';
import {
  Check,
  CircleAlert,
  Laptop,
  LoaderCircle,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Type,
} from 'lucide-react';
import { DEFAULT_APPEARANCE, FONT_OPTIONS, THEME_OPTIONS } from '../shared/appearance';
import { useAppearance } from './appearance';
import { isPreview } from './bridge';

export function AppearanceCard() {
  const { t } = useI18n();
  const { appearance, update, saving, error } = useAppearance();
  const themes = {
    forest: { label: t('松林米白', 'Forest cream'), description: t('温暖纸感，清新绿意', 'Warm paper and fresh greens') },
    ocean: { label: t('晴空蓝白', 'Ocean blue'), description: t('明亮干净，清爽专注', 'Bright, clean and focused') },
    lavender: { label: t('雾紫', 'Lavender'), description: t('柔和紫调，安静阅读', 'Soft purple for quiet reading') },
    midnight: { label: t('午夜深色', 'Midnight'), description: t('深色背景，清晰文字', 'Dark backgrounds, clear text') },
    system: { label: t('跟随系统', 'Follow system'), description: t('随 Windows 切换明暗', 'Follow Windows light or dark mode') },
  };
  const fonts = {
    standard: { label: t('标准', 'Standard'), hint: t('清晰紧凑', 'Clear and compact') },
    large: { label: t('大号', 'Large'), hint: t('默认 · 舒适阅读', 'Default · Comfortable reading') },
    'extra-large': { label: t('特大', 'Extra large'), hint: t('文字更醒目', 'More prominent text') },
  };
  return (
    <section className="card appearance-card" aria-labelledby="appearance-title">
      <div className="appearance-header">
        <div className="settings-card-heading">
          <span className="settings-heading-icon">
            <Palette size={23} />
          </span>
          <div>
            <h2 id="appearance-title">{t("外观与阅读", "Appearance and reading")}</h2>
            <p>{t("选择喜欢的色彩，找到一眼就能看清的字号。", "Choose your colors and a comfortable reading size.")}</p>
          </div>
        </div>
        <span className="appearance-status" role="status">
          {saving ? (
            <>
              <LoaderCircle size={16} className="spin" />
              {t("正在保存…", "Saving…")}
            </>
          ) : error ? (
            <>
              <CircleAlert size={16} />
              {t("外观设置需要重试", "Try saving appearance again")}
            </>
          ) : (
            <>
              <Check size={16} />
              {isPreview ? t("仅保存本机预览外观", "Saved for this browser preview only") : t("即时生效 · 自动保存", "Applies instantly · Saves automatically")}
            </>
          )}
        </span>
      </div>
      <div className="appearance-theme-grid" role="group" aria-label={t("界面主题", "Interface theme")}>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`theme-option ${appearance.theme === option.id ? 'selected' : ''}`}
            data-preview={option.id}
            aria-pressed={appearance.theme === option.id}
            onClick={() => void update({ theme: option.id })}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span className="theme-swatch-sidebar" />
              <span className="theme-swatch-card">
                <i />
                <i />
                <i />
              </span>
              {option.id === 'system' && <Laptop size={24} />}
            </span>
            <span className="theme-option-name">
              {option.id === 'midnight' ? (
                <Moon size={17} />
              ) : option.id === 'system' ? (
                <Laptop size={17} />
              ) : (
                <Sun size={17} />
              )}
              {themes[option.id].label}
              {appearance.theme === option.id && (
                <Check size={17} className="theme-selected-indicator" />
              )}
            </span>
            <span className="theme-option-description">{themes[option.id].description}</span>
          </button>
        ))}
      </div>
      <div className="appearance-font-header">
        <div>
          <h3>
            <Type size={19} />
            {t("文字大小", "Text size")}
          </h3>
          <p>{t("主界面和纠错弹窗会一起调整，重新打开后仍然保留。", "Applies to the main window and popup, and stays set when you reopen the app.")}</p>
        </div>
        <button className="text-button" onClick={() => void update(DEFAULT_APPEARANCE)}>
          <RotateCcw size={15} />
          {t("恢复默认", "Restore defaults")}
        </button>
      </div>
      <div className="appearance-font-options" role="group" aria-label={t("文字大小", "Text size")}>
        {FONT_OPTIONS.map((option) => (
          <button
            className={`font-size-option ${appearance.fontSize === option.id ? 'selected' : ''}`}
            key={option.id}
            aria-pressed={appearance.fontSize === option.id}
            onClick={() => void update({ fontSize: option.id })}
          >
            <span className="font-size-sample" style={{ fontSize: `${option.size}px` }}>
              {t("Aa 字", "Aa")}
            </span>
            <span>
              <strong>{fonts[option.id].label}</strong>
              <small>
                {fonts[option.id].hint} · {option.size}px
              </small>
            </span>
            {appearance.fontSize === option.id && <Check size={19} />}
          </button>
        ))}
      </div>
      <div className="appearance-preview">
        <span className="appearance-preview-label">{t("阅读预览", "Reading preview")}</span>
        <p className="appearance-preview-sentence">Every sentence is a small step forward.</p>
        <p>{t("每天一句，慢慢积累。清晰的文字，让学习更轻松。", "One sentence each day. Clear text makes learning easier.")}</p>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={18} />
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}

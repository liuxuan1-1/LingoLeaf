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
  const { appearance, update, saving, error } = useAppearance();
  return (
    <section className="card appearance-card" aria-labelledby="appearance-title">
      <div className="appearance-header">
        <div className="settings-card-heading">
          <span className="settings-heading-icon">
            <Palette size={23} />
          </span>
          <div>
            <h2 id="appearance-title">外观与阅读</h2>
            <p>选择喜欢的色彩，找到一眼就能看清的字号。</p>
          </div>
        </div>
        <span className="appearance-status" role="status">
          {saving ? (
            <>
              <LoaderCircle size={16} className="spin" />
              正在保存…
            </>
          ) : error ? (
            <>
              <CircleAlert size={16} />
              外观设置需要重试
            </>
          ) : (
            <>
              <Check size={16} />
              {isPreview ? '仅保存本机预览外观' : '即时生效 · 自动保存'}
            </>
          )}
        </span>
      </div>
      <div className="appearance-theme-grid" role="group" aria-label="界面主题">
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
              {option.label}
              {appearance.theme === option.id && (
                <Check size={17} className="theme-selected-indicator" />
              )}
            </span>
            <span className="theme-option-description">{option.description}</span>
          </button>
        ))}
      </div>
      <div className="appearance-font-header">
        <div>
          <h3>
            <Type size={19} />
            文字大小
          </h3>
          <p>主界面和纠错弹窗会一起调整，重新打开后仍然保留。</p>
        </div>
        <button className="text-button" onClick={() => void update(DEFAULT_APPEARANCE)}>
          <RotateCcw size={15} />
          恢复默认
        </button>
      </div>
      <div className="appearance-font-options" role="group" aria-label="文字大小">
        {FONT_OPTIONS.map((option) => (
          <button
            className={`font-size-option ${appearance.fontSize === option.id ? 'selected' : ''}`}
            key={option.id}
            aria-pressed={appearance.fontSize === option.id}
            onClick={() => void update({ fontSize: option.id })}
          >
            <span className="font-size-sample" style={{ fontSize: `${option.size}px` }}>
              Aa 字
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>
                {option.hint} · {option.size}px
              </small>
            </span>
            {appearance.fontSize === option.id && <Check size={19} />}
          </button>
        ))}
      </div>
      <div className="appearance-preview">
        <span className="appearance-preview-label">阅读预览</span>
        <p className="appearance-preview-sentence">Every sentence is a small step forward.</p>
        <p>每天一句，慢慢积累。清晰的文字，让学习更轻松。</p>
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

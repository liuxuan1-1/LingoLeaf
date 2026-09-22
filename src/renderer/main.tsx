import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Popup } from './Popup';
import './styles.css';
import { AppearanceProvider, bootstrapAppearance } from './appearance';
import { LanguageProvider, bootstrapLanguage, useI18n } from './i18n';

bootstrapAppearance();
bootstrapLanguage();

function FatalPage({ error }: { error: string }) {
  const { t } = useI18n();
  return <div className="fatal"><span className="eyebrow">LINGOLEAF</span>
    <h1>{t('暂时无法显示这个页面', 'This page could not be displayed')}</h1><p>{error}</p>
    <button className="button primary" onClick={() => location.reload()}>{t('重新载入', 'Reload')}</button>
  </div>;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return <FatalPage error={this.state.error} />;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <AppearanceProvider>
          {location.hash.startsWith('#popup') ? <Popup /> : <App />}
        </AppearanceProvider>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);

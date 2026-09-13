import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Popup } from './Popup';
import './styles.css';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <div className="fatal"><span className="eyebrow">LINGOLEAF</span><h1>暂时无法显示这个页面</h1><p>{this.state.error}</p><button className="button primary" onClick={() => location.reload()}>重新载入</button></div>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary>{location.hash.startsWith('#popup') ? <Popup /> : <App />}</ErrorBoundary></React.StrictMode>);

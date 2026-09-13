import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Keyboard,
  Leaf,
  Link,
  PlugZap,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Provider, RequestProtocol, Settings } from '../shared/types';
import { api, errorMessage } from './bridge';
import { SectionHeading, Shortcut, Spinner, Toggle, type Notify } from './components';
import { AppearanceCard } from './AppearanceCard';

const providers: { id: Provider; name: string; detail: string; endpoint: string; model: string }[] =
  [
    {
      id: 'openai',
      name: 'OpenAI',
      detail: 'GPT models',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      detail: 'Claude models',
      endpoint: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    },
    {
      id: 'azure',
      name: 'Azure AI',
      detail: 'Azure OpenAI',
      endpoint: 'https://YOUR-RESOURCE.openai.azure.com',
      model: '',
    },
    {
      id: 'ollama',
      name: 'Ollama',
      detail: '本地模型',
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:7b',
    },
    {
      id: 'compatible',
      name: '兼容接口',
      detail: 'OpenAI compatible',
      endpoint: 'http://localhost:1234/v1',
      model: 'local-model',
    },
  ];
function ShortcutEditor({
  label,
  description,
  value,
  registered,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  registered: boolean;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        setInvalid(true);
        return;
      }
      const keyNames: Record<string, string> = {
        ' ': 'Space',
        '+': 'Plus',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        Escape: 'Esc',
      };
      const key = event.code.startsWith('Key')
        ? event.code.slice(3)
        : event.code.startsWith('Digit')
          ? event.code.slice(5)
          : keyNames[event.key] || event.key;
      onChange(
        [
          event.ctrlKey ? 'Control' : '',
          event.altKey ? 'Alt' : '',
          event.shiftKey ? 'Shift' : '',
          event.metaKey ? 'Meta' : '',
          key,
        ]
          .filter(Boolean)
          .join('+'),
      );
      setRecording(false);
      setInvalid(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, onChange]);
  return (
    <div className="shortcut-setting">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <div>
        <button
          className={`shortcut-record ${recording ? 'recording' : ''}`}
          onClick={() => {
            setRecording((value) => !value);
            setInvalid(false);
          }}
          aria-label={`设置${label}快捷键`}
        >
          {recording ? '按下组合键 · Esc 取消' : <Shortcut value={value} />}
        </button>
        <span className={`shortcut-status ${!registered ? 'warning' : ''}`}>
          {recording
            ? invalid
              ? '请包含 Ctrl、Alt 或 Win'
              : '等待按键…'
            : registered
              ? '当前已启用 · 点击修改'
              : '保存后尝试注册快捷键'}
        </span>
      </div>
    </div>
  );
}
export function SettingsPage({
  settings,
  initialDraft,
  onDraft,
  shortcuts,
  notify,
  onSaved,
  refresh,
}: {
  settings: Settings;
  initialDraft: Settings | null;
  onDraft: (draft: Settings | null) => void;
  shortcuts: { grammar: boolean; translate: boolean };
  notify: Notify;
  onSaved: (settings: Settings) => void;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Settings>(initialDraft || { ...settings, apiKey: '' });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dirty, setDirty] = useState(Boolean(initialDraft));
  useEffect(() => {
    onDraft(dirty ? draft : null);
  }, [draft, dirty, onDraft]);
  const field = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    if (
      ['provider', 'endpoint', 'model', 'apiKey', 'azureApiVersion', 'requestProtocol'].includes(
        key,
      )
    )
      setTestResult(null);
  };
  const changeProvider = (provider: Provider) => {
    const defaults = providers.find((item) => item.id === provider)!;
    setDraft((current) => ({
      ...current,
      provider,
      requestProtocol: 'auto',
      endpoint: defaults.endpoint,
      model: defaults.model,
      apiKey: '',
      hasApiKey: provider === settings.provider ? settings.hasApiKey : false,
      clearApiKey: false,
    }));
    setDirty(true);
    setTestResult(null);
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveSettings(draft);
      setDraft({ ...saved, apiKey: '', clearApiKey: false });
      setDirty(false);
      onSaved(saved);
      await refresh();
      notify('设置已保存，新的快捷键与模型配置已生效。');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const message = await api.testProvider(draft);
      setTestResult({ ok: true, message });
    } catch (e) {
      setTestResult({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };
  return (
    <>
      <SectionHeading
        eyebrow="MAKE IT FEEL LIKE YOURS"
        title="你的工具，你做主。"
        description="选择喜欢的模型、熟悉的快捷键，以及自己的笔记存放方式。"
        action={
          <span className="settings-status">
            <span className={dirty ? 'unsaved' : ''} />
            {dirty ? '有未保存的修改' : '设置已保存'}
          </span>
        }
      />
      <AppearanceCard />
      <div className="settings-layout">
        <fieldset className="settings-main" disabled={testing || saving}>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-heading-icon">
                <Cpu size={21} />
              </span>
              <div>
                <h2>模型连接</h2>
                <p>使用你自己的 API，或让模型在本机运行。</p>
              </div>
              <span className="settings-step">01</span>
            </div>
            <div className="provider-grid">
              {providers.map((provider) => (
                <button
                  className={`provider-card ${draft.provider === provider.id ? 'selected' : ''}`}
                  onClick={() => changeProvider(provider.id)}
                  key={provider.id}
                >
                  <span className="provider-monogram">
                    {provider.id === 'ollama' ? (
                      <Server size={19} />
                    ) : provider.id === 'compatible' ? (
                      <Link size={18} />
                    ) : (
                      provider.name.slice(0, 1)
                    )}
                  </span>
                  <strong>{provider.name}</strong>
                  <small>{provider.detail}</small>
                  {draft.provider === provider.id && <Check size={13} className="provider-check" />}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="form-field full">
                <span>
                  接口地址 <small>Endpoint</small>
                </span>
                <input
                  value={draft.endpoint}
                  onChange={(e) => field('endpoint', e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                />
                <small>
                  {draft.provider === 'azure'
                    ? '填写 Azure OpenAI 资源地址；部署名称在下方填写。Azure AI 其他兼容端点可选择「兼容接口」。'
                    : draft.provider === 'ollama'
                      ? '本机 Ollama 通常使用 http://localhost:11434。请先拉取并启动所选模型。'
                      : draft.provider === 'compatible'
                        ? '支持 OpenAI Chat Completions 和 Responses 接口，包括 LM Studio、vLLM、Copilot Bridge。'
                        : '可使用官方接口或你信任的代理地址。'}
                </small>
              </label>
              {(draft.provider === 'openai' || draft.provider === 'compatible') && (
                <label className="form-field full">
                  <span>
                    请求协议 <small>API protocol</small>
                  </span>
                  <select
                    value={draft.requestProtocol ?? 'auto'}
                    onChange={(e) => field('requestProtocol', e.target.value as RequestProtocol)}
                  >
                    <option value="auto">自动识别（推荐）</option>
                    <option value="chat-completions">Chat Completions</option>
                    <option value="responses">Responses API</option>
                  </select>
                  <small>
                    Copilot Bridge 的 /codex 地址使用
                    Responses。自动模式会识别完整接口路径，并在路由不存在时尝试另一种协议。
                  </small>
                </label>
              )}
              <label className={`form-field ${draft.provider !== 'azure' ? 'full' : ''}`}>
                <span>
                  {draft.provider === 'azure' ? '部署名称' : '模型名称'}{' '}
                  <small>{draft.provider === 'azure' ? 'Deployment' : 'Model'}</small>
                </span>
                <input
                  value={draft.model}
                  onChange={(e) => field('model', e.target.value)}
                  placeholder={
                    draft.provider === 'azure'
                      ? '例如：my-gpt-deployment'
                      : '输入你有访问权限的模型 ID'
                  }
                  spellCheck={false}
                />
              </label>
              {draft.provider === 'azure' && (
                <label className="form-field">
                  <span>API 版本</span>
                  <input
                    value={draft.azureApiVersion}
                    onChange={(e) => field('azureApiVersion', e.target.value)}
                    placeholder="2024-10-21"
                    spellCheck={false}
                  />
                </label>
              )}
              <label className="form-field full">
                <span>
                  API 密钥
                  {(draft.provider === 'ollama' || draft.provider === 'compatible') &&
                    '（本地服务可留空）'}{' '}
                  <small>API Key</small>
                </span>
                <div className="password-input">
                  <KeyRound size={17} />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(e) => field('apiKey', e.target.value)}
                    placeholder={
                      draft.hasApiKey
                        ? '密钥已保存 · 留空保留当前密钥'
                        : draft.provider === 'ollama'
                          ? '本地 Ollama 通常不需要密钥'
                          : '输入你的 API Key'
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>
                  密钥由 Windows 加密保存，不会写入学习笔记。更换服务商或接口地址后需重新填写。
                </small>
              </label>
            </div>
            {settings.hasApiKey && (
              <label className="simple-checkbox">
                <input
                  type="checkbox"
                  checked={draft.clearApiKey || false}
                  onChange={(e) => field('clearApiKey', e.target.checked)}
                />
                保存时移除已存储的 API 密钥
              </label>
            )}
            <div className="connection-footer">
              <span>
                <ShieldCheck size={15} />
                仅连接你配置的服务
              </span>
              <button
                className="button secondary small"
                disabled={testing || saving || !draft.endpoint || !draft.model}
                onClick={test}
              >
                {testing ? (
                  <Spinner label="正在连接…" />
                ) : (
                  <>
                    <PlugZap size={16} />
                    测试连接
                  </>
                )}
              </button>
            </div>
            {testResult && (
              <div
                className={`connection-result ${testResult.ok ? 'success' : 'error'}`}
                role="status"
              >
                {testResult.ok ? <Check size={17} /> : <CircleAlert size={18} />}
                <div>
                  <strong>{testResult.ok ? '连接成功' : '连接未完成'}</strong>
                  <p>{testResult.message}</p>
                </div>
              </div>
            )}
          </section>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-heading-icon">
                <Keyboard size={21} />
              </span>
              <div>
                <h2>语言与快捷键</h2>
                <p>选中文字，按下组合键。学习不必打断工作。</p>
              </div>
              <span className="settings-step">02</span>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>翻译目标语言</span>
                <input
                  list="language-options"
                  value={draft.targetLanguage}
                  onChange={(e) => field('targetLanguage', e.target.value)}
                  placeholder="English"
                />
              </label>
              <label className="form-field">
                <span>语法讲解语言</span>
                <input
                  list="language-options"
                  value={draft.explanationLanguage}
                  onChange={(e) => field('explanationLanguage', e.target.value)}
                  placeholder="简体中文"
                />
              </label>
              <datalist id="language-options">
                {[
                  'English',
                  '简体中文',
                  '繁體中文',
                  '日本語',
                  '한국어',
                  'Español',
                  'Français',
                  'Deutsch',
                ].map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </datalist>
            </div>
            <div className="shortcut-settings">
              <ShortcutEditor
                label="全局语法纠错"
                description="显示修改建议与语法讲解"
                value={draft.grammarShortcut}
                registered={shortcuts.grammar && draft.grammarShortcut === settings.grammarShortcut}
                onChange={(value) => field('grammarShortcut', value)}
              />
              <ShortcutEditor
                label="全局翻译替换"
                description="翻译选中的文字，可替换回原应用"
                value={draft.translateShortcut}
                registered={
                  shortcuts.translate && draft.translateShortcut === settings.translateShortcut
                }
                onChange={(value) => field('translateShortcut', value)}
              />
            </div>
            <Toggle
              label="翻译后自动替换选中文字"
              description="仅在原窗口和选区仍然匹配时执行替换；否则保留译文供你复制。"
              checked={draft.autoReplace}
              onChange={(value) => field('autoReplace', value)}
            />
          </section>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-heading-icon">
                <FolderOpen size={21} />
              </span>
              <div>
                <h2>笔记与日常使用</h2>
                <p>普通 Markdown 文件，随时阅读、备份和带走。</p>
              </div>
              <span className="settings-step">03</span>
            </div>
            <label className="form-field">
              <span>学习笔记文件夹</span>
              <div className="folder-input">
                <input value={draft.libraryPath} readOnly placeholder="选择文件夹" />
                <button
                  className="button secondary small"
                  onClick={async () => {
                    try {
                      const path = await api.chooseLibrary();
                      if (path) field('libraryPath', path);
                    } catch (e) {
                      notify(errorMessage(e), 'error');
                    }
                  }}
                >
                  <FolderOpen size={15} />
                  选择
                </button>
              </div>
              <small>
                可选择 OneDrive、Dropbox
                等同步目录中的文件夹，让笔记同步到手机。更改路径并保存后，会在新目录生成笔记。
              </small>
            </label>
            <div className="settings-toggles">
              <Toggle
                label="也收藏语法正确的句子"
                description="把检查过的正确表达一并加入学习库与复习计划。"
                checked={draft.saveCorrectSentences}
                onChange={(value) => field('saveCorrectSentences', value)}
              />
              <Toggle
                label="开机时启动 LingoLeaf"
                description="登录 Windows 后启动，在系统托盘中随时待命。"
                checked={draft.launchAtLogin}
                onChange={(value) => field('launchAtLogin', value)}
              />
            </div>
          </section>
          <div className="settings-savebar">
            <span>{dirty ? '修改将在保存后生效' : '你的学习空间，准备好了'}</span>
            <button className="button primary" onClick={save} disabled={saving || testing}>
              {saving ? (
                <Spinner label="正在保存…" />
              ) : (
                <>
                  <Check size={17} />
                  保存设置
                </>
              )}
            </button>
          </div>
        </fieldset>
        <aside className="settings-aside">
          <div className="privacy-card">
            <span className="privacy-art">
              <Leaf size={31} strokeWidth={1.4} />
            </span>
            <span className="eyebrow">PERSONAL BY DESIGN</span>
            <h3>
              学习属于你，
              <br />
              笔记也是。
            </h3>
            <p>句子只会在你主动纠错或翻译时，发送到所配置的模型接口。</p>
            <div>
              <ShieldCheck size={17} />
              <span>API 密钥由系统加密</span>
            </div>
            <div>
              <FolderOpen size={17} />
              <span>笔记以 Markdown 保存</span>
            </div>
            <div>
              <Server size={17} />
              <span>支持本地模型运行</span>
            </div>
            <small>模型服务可能产生 API 费用，具体以服务商的计费方式为准。</small>
          </div>
          <div className="settings-help">
            <strong>刚开始使用？</strong>
            <p>选好服务商，填入接口地址、模型与密钥，点击「测试连接」，最后保存即可。</p>
            <p>本地模型也需要支持结构化回答。结果格式不完整时，可换用能力更强的模型。</p>
          </div>
        </aside>
      </div>
    </>
  );
}

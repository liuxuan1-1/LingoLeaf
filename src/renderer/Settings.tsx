import { useI18n } from './i18n';
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
  Languages,
  Leaf,
  Link,
  PlugZap,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Provider, RequestProtocol, Settings, UiLanguage } from '../shared/types';
import { UI_LANGUAGES, type Translate } from '../shared/i18n';
import { api, errorMessage } from './bridge';
import { SectionHeading, Shortcut, Spinner, Toggle, type Notify } from './components';
import { AppearanceCard } from './AppearanceCard';

function getProviders(t: Translate): { id: Provider; name: string; detail: string; endpoint: string; model: string }[] {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      detail: t("GPT 模型", "GPT models"),
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      detail: t("Claude 模型", "Claude models"),
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
      detail: t("本地模型", "Local models"),
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:7b',
    },
    {
      id: 'compatible',
      name: t("兼容接口", "Compatible API"),
      detail: t("兼容 OpenAI", "OpenAI compatible"),
      endpoint: 'http://localhost:1234/v1',
      model: 'local-model',
    },
  ];
}
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
  const { t } = useI18n();
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
          aria-label={t('设置{label}快捷键', 'Set shortcut for {label}', { label })}
        >
          {recording ? t("按下组合键 · Esc 取消", "Press a shortcut · Esc to cancel") : <Shortcut value={value} />}
        </button>
        <span className={`shortcut-status ${!registered ? 'warning' : ''}`}>
          {recording
            ? invalid
              ? t("请包含 Ctrl、Alt 或 Win", "Include Ctrl, Alt or Win")
              : t("等待按键…", "Waiting for keys…")
            : registered
              ? t("当前已启用 · 点击修改", "Enabled · Click to change")
              : t("保存后尝试注册快捷键", "The shortcut will be registered when saved")}
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
  const { language, t, saving: savingLanguage, error: languageError, setLanguage } = useI18n();
  const providers = getProviders(t);
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
      notify(t("设置已保存，新的快捷键与模型配置已生效。", "Settings saved. Your shortcuts and model configuration are now active."));
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
        eyebrow={t("打造你的学习空间", "MAKE IT FEEL LIKE YOURS")}
        title={t("你的工具，你做主。", "Make this space yours.")}
        description={t("选择喜欢的模型、熟悉的快捷键，以及自己的笔记存放方式。", "Choose your model, shortcuts and where to keep your notes.")}
        action={
          <span className="settings-status">
            <span className={dirty ? 'unsaved' : ''} />
            {dirty ? t("有未保存的修改", "Unsaved changes") : t("设置已保存", "Settings saved")}
          </span>
        }
      />
      <section className="card settings-card language-card">
        <div className="settings-card-heading">
          <span className="settings-heading-icon"><Languages size={23} /></span>
          <div>
            <h2>{t('界面语言', 'Interface language')}</h2>
            <p>{t('选择应用界面的语言。翻译目标语言和讲解语言可在下方单独设置。', 'Choose the app language. Translation and explanation languages are configured separately below.')}</p>
          </div>
        </div>
        <label className="form-field">
          <span>{t('界面语言', 'Interface language')}</span>
          <select value={language} onChange={(event) => void setLanguage(event.target.value as UiLanguage)}>
            {UI_LANGUAGES.map((item) => <option key={item.value} value={item.value} lang={item.value}>{item.label}</option>)}
          </select>
          <small role="status">{savingLanguage ? t('正在保存语言…', 'Saving language…') : t('即时生效 · 自动保存', 'Applies instantly · Saves automatically')}</small>
        </label>
        {languageError && <div className="inline-error" role="alert"><CircleAlert size={18} /><p>{languageError}</p></div>}
      </section>
      <AppearanceCard />
      <div className="settings-layout">
        <fieldset className="settings-main" disabled={testing || saving}>
          <section className="card settings-card">
            <div className="settings-card-heading">
              <span className="settings-heading-icon">
                <Cpu size={21} />
              </span>
              <div>
                <h2>{t("模型连接", "Model connection")}</h2>
                <p>{t("使用你自己的 API，或让模型在本机运行。", "Connect your own API or run a model locally.")}</p>
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
                  {t("接口地址", "Endpoint")}
                </span>
                <input
                  value={draft.endpoint}
                  onChange={(e) => field('endpoint', e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                />
                <small>
                  {draft.provider === 'azure'
                    ? t("填写 Azure OpenAI 资源地址；部署名称在下方填写。Azure AI 其他兼容端点可选择「兼容接口」。", "Enter your Azure OpenAI resource endpoint and the deployment name below. For other compatible Azure AI endpoints, choose Compatible API.")
                    : draft.provider === 'ollama'
                      ? t("本机 Ollama 通常使用 http://localhost:11434。请先拉取并启动所选模型。", "Local Ollama usually uses http://localhost:11434. Download and start your chosen model first.")
                      : draft.provider === 'compatible'
                        ? t("支持 OpenAI Chat Completions 和 Responses 接口。", "Supports OpenAI Chat Completions and Responses APIs.")
                        : t("可使用官方接口或你信任的代理地址。", "Use the official endpoint or a proxy you trust.")}
                </small>
              </label>
              {(draft.provider === 'openai' || draft.provider === 'compatible') && (
                <label className="form-field full">
                  <span>
                    {t("请求协议", "API protocol")}
                  </span>
                  <select
                    value={draft.requestProtocol ?? 'auto'}
                    onChange={(e) => field('requestProtocol', e.target.value as RequestProtocol)}
                  >
                    <option value="auto">{t("自动识别（推荐）", "Auto-detect (recommended)")}</option>
                    <option value="chat-completions">Chat Completions</option>
                    <option value="responses">Responses API</option>
                  </select>
                  <small>
                    {t("自动模式会识别完整接口路径，并在路由不存在时尝试另一种协议。", "Auto mode recognizes full endpoint paths and tries the other protocol when a route is unavailable.")}
                  </small>
                </label>
              )}
              <label className={`form-field ${draft.provider !== 'azure' ? 'full' : ''}`}>
                <span>
                  {draft.provider === 'azure' ? t("部署名称", "Deployment name") : t("模型名称", "Model name")}{' '}
                </span>
                <input
                  value={draft.model}
                  onChange={(e) => field('model', e.target.value)}
                  placeholder={
                    draft.provider === 'azure'
                      ? t("例如：my-gpt-deployment", "For example: my-gpt-deployment")
                      : t("输入你有访问权限的模型 ID", "Enter a model ID you have access to")
                  }
                  spellCheck={false}
                />
              </label>
              {draft.provider === 'azure' && (
                <label className="form-field">
                  <span>{t("API 版本", "API version")}</span>
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
                  {t("API 密钥", "API key")}
                  {(draft.provider === 'ollama' || draft.provider === 'compatible') &&
                    t("（本地服务可留空）", "(optional for local services)")}{' '}
                </span>
                <div className="password-input">
                  <KeyRound size={17} />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(e) => field('apiKey', e.target.value)}
                    placeholder={
                      draft.hasApiKey
                        ? t("密钥已保存 · 留空保留当前密钥", "Key saved · Leave blank to keep it")
                        : draft.provider === 'ollama'
                          ? t("本地 Ollama 通常不需要密钥", "Local Ollama usually needs no key")
                          : t("输入你的 API Key", "Enter your API key")
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? t("隐藏密钥", "Hide API key") : t("显示密钥", "Show API key")}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>
                  {t("密钥由 Windows 加密保存，不会写入学习笔记。更换服务商或接口地址后需重新填写。", "Your key is encrypted by Windows and excluded from notes. Enter it again if you change provider or endpoint.")}
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
                {t("保存时移除已存储的 API 密钥", "Remove the stored API key when saving")}
              </label>
            )}
            <div className="connection-footer">
              <span>
                <ShieldCheck size={15} />
                {t("仅连接你配置的服务", "Connects only to your configured service")}
              </span>
              <button
                className="button secondary small"
                disabled={testing || saving || !draft.endpoint || !draft.model}
                onClick={test}
              >
                {testing ? (
                  <Spinner label={t("正在连接…", "Connecting…")} />
                ) : (
                  <>
                    <PlugZap size={16} />
                    {t("测试连接", "Test connection")}
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
                  <strong>{testResult.ok ? t("连接成功", "Connection successful") : t("连接未完成", "Connection failed")}</strong>
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
                <h2>{t("语言与快捷键", "Learning languages and shortcuts")}</h2>
                <p>{t("选中文字，按下组合键。学习不必打断工作。", "Select text and press a shortcut to learn as you work.")}</p>
              </div>
              <span className="settings-step">02</span>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>{t("翻译目标语言", "Translation target language")}</span>
                <input
                  list="language-options"
                  value={draft.targetLanguage}
                  onChange={(e) => field('targetLanguage', e.target.value)}
                  placeholder="English"
                />
              </label>
              <label className="form-field">
                <span>{t("讲解语言", "Explanation language")}</span>
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
                label={t("全局语法纠错", "Global writing check")}
                description={t("显示纠错、专业表达与讲解", "Show corrections, professional wording and explanations")}
                value={draft.grammarShortcut}
                registered={shortcuts.grammar && draft.grammarShortcut === settings.grammarShortcut}
                onChange={(value) => field('grammarShortcut', value)}
              />
              <ShortcutEditor
                label={t("全局翻译替换", "Global translation and replacement")}
                description={t("翻译选中的文字，可替换回原应用", "Translate selected text and replace it in the original app")}
                value={draft.translateShortcut}
                registered={
                  shortcuts.translate && draft.translateShortcut === settings.translateShortcut
                }
                onChange={(value) => field('translateShortcut', value)}
              />
            </div>
            <Toggle
              label={t("翻译后自动替换选中文字", "Automatically replace selected text after translation")}
              description={t("仅在原窗口和选区仍然匹配时执行替换；否则保留译文供你复制。", "Replacement runs only when the original window and selection still match. Otherwise, copy the translation yourself.")}
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
                <h2>{t("笔记与日常使用", "Notes and everyday use")}</h2>
                <p>{t("普通 Markdown 文件，随时阅读、备份和带走。", "Plain Markdown files you can read, back up and take anywhere.")}</p>
              </div>
              <span className="settings-step">03</span>
            </div>
            <label className="form-field">
              <span>{t("学习笔记文件夹", "Learning notes folder")}</span>
              <div className="folder-input">
                <input value={draft.libraryPath} readOnly placeholder={t("选择文件夹", "Choose a folder")} />
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
                  {t("选择", "Choose")}
                </button>
              </div>
              <small>
                {t("可选择 OneDrive、Dropbox 等同步目录中的文件夹，让笔记同步到手机。更改路径并保存后，会在新目录生成笔记。", "Choose a folder in OneDrive, Dropbox or another sync directory to read notes on your phone. Saving a new path generates notes in that folder.")}
              </small>
            </label>
            <div className="settings-toggles">
              <Toggle
                label={t("也收藏语法正确的句子", "Save grammatically correct sentences too")}
                description={t("把检查过的正确表达一并加入学习库与复习计划。", "Add correct sentences to your library and review schedule after checking them.")}
                checked={draft.saveCorrectSentences}
                onChange={(value) => field('saveCorrectSentences', value)}
              />
              <Toggle
                label={t("开机时启动 LingoLeaf", "Launch LingoLeaf at login")}
                description={t("登录 Windows 后启动，在系统托盘中随时待命。", "Start with Windows and stay available in the system tray.")}
                checked={draft.launchAtLogin}
                onChange={(value) => field('launchAtLogin', value)}
              />
            </div>
          </section>
          <div className="settings-savebar">
            <span>{dirty ? t("修改将在保存后生效", "Changes take effect after saving") : t("你的学习空间，准备好了", "Your learning space is ready")}</span>
            <button className="button primary" onClick={save} disabled={saving || testing}>
              {saving ? (
                <Spinner label={t("正在保存…", "Saving…")} />
              ) : (
                <>
                  <Check size={17} />
                  {t("保存设置", "Save settings")}
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
            <span className="eyebrow">{t("为你而设计", "PERSONAL BY DESIGN")}</span>
            <h3>
              {t("学习属于你，", "Your learning,")}
              <br />
              {t("笔记也是。", "your notes.")}
            </h3>
            <p>{t("仅在你主动分析文字或继续追问时，内容才会发送到配置的模型接口。", "Text is sent to your configured model only when you request analysis or ask a follow-up.")}</p>
            <div>
              <ShieldCheck size={17} />
              <span>{t("API 密钥由系统加密", "API keys encrypted by your system")}</span>
            </div>
            <div>
              <FolderOpen size={17} />
              <span>{t("笔记以 Markdown 保存", "Notes saved as Markdown")}</span>
            </div>
            <div>
              <Server size={17} />
              <span>{t("支持本地模型运行", "Local models supported")}</span>
            </div>
            <small>{t("模型服务可能产生 API 费用，具体以服务商的计费方式为准。", "Model requests may incur API charges according to your provider’s pricing.")}</small>
          </div>
          <div className="settings-help">
            <strong>{t("刚开始使用？", "Getting started?")}</strong>
            <p>{t("选好服务商，填入接口地址、模型与密钥，点击「测试连接」，最后保存即可。", "Choose a provider, enter its endpoint, model and key, test the connection, then save.")}</p>
            <p>{t("本地模型也需要支持结构化回答。结果格式不完整时，可换用能力更强的模型。", "Local models also need to produce structured answers. If output is incomplete, try a more capable model.")}</p>
          </div>
        </aside>
      </div>
    </>
  );
}

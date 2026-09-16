import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  safeStorage,
  screen,
  shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { LibraryStore, credentialScope } from './store';
import { analyzeText, testProvider } from './providers';
import { NativeService, type NativeCapture } from './native';
import { MobileServer } from './mobile';
import type { Analysis, Mode, ResultEvent, Settings } from '../shared/types';
import { DEFAULT_APPEARANCE, resolveTheme, WINDOW_BACKGROUNDS } from '../shared/appearance';

let main: BrowserWindow | undefined, popup: BrowserWindow | undefined, tray: Tray | undefined;
let store: LibraryStore, native: NativeService, mobile: MobileServer;
let quitting = false,
  capturing = false,
  latestResult: ResultEvent | undefined;
let pending: { capture: NativeCapture; result: Analysis; at: number } | undefined;
let shortcuts = { grammar: false, translate: false };
const textInput = z
  .string()
  .min(1, '请先选中或输入一句话。')
  .max(12000, '一次最多处理 12,000 个字符。')
  .refine((text) => text.trim().length > 0, '请先选中或输入一句话。');
const modeInput = z.enum(['grammar', 'translate']);
const ratingInput = z.enum(['again', 'hard', 'good', 'easy']);
const settingsInput = z.object({
  provider: z.enum(['openai', 'compatible', 'anthropic', 'azure', 'ollama']),
  requestProtocol: z.enum(['auto', 'chat-completions', 'responses']).default('auto'),
  endpoint: z.string().max(2048),
  model: z.string().max(200),
  apiKey: z.string().max(8192),
  hasApiKey: z.boolean(),
  azureApiVersion: z.string().max(100),
  targetLanguage: z.string().trim().min(1).max(80),
  explanationLanguage: z.string().trim().min(1).max(80),
  grammarShortcut: z.string().min(1).max(100),
  translateShortcut: z.string().min(1).max(100),
  libraryPath: z.string().max(4096),
  autoReplace: z.boolean(),
  launchAtLogin: z.boolean(),
  saveCorrectSentences: z.boolean(),
  clearApiKey: z.boolean().optional(),
});

function broadcast() {
  for (const w of BrowserWindow.getAllWindows())
    if (!w.isDestroyed()) w.webContents.send('changed');
}
function windowBackground() {
  const appearance = store?.getAppearance() ?? DEFAULT_APPEARANCE;
  return WINDOW_BACKGROUNDS[resolveTheme(appearance.theme, nativeTheme.shouldUseDarkColors)];
}
function applyNativeAppearance() {
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(windowBackground());
}
function syncNativeTheme() {
  const theme = store.getAppearance().theme;
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme === 'midnight' ? 'dark' : 'light';
  applyNativeAppearance();
}
function publish(result: ResultEvent) {
  latestResult = result;
  if (popup && !popup.isDestroyed()) popup.webContents.send('result', result);
}
function secureWindow(w: BrowserWindow) {
  w.on('page-title-updated', (event) => event.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (event) => event.preventDefault());
  w.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
}
function load(w: BrowserWindow, hash = '') {
  if (!app.isPackaged && process.env.LINGOLEAF_DEV_URL)
    return w.loadURL(process.env.LINGOLEAF_DEV_URL + (hash ? '/#' + hash : ''));
  return w.loadFile(path.join(__dirname, '../renderer/index.html'), { hash });
}
function showMain() {
  if (!main || main.isDestroyed()) {
    main = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 900,
      minHeight: 640,
      frame: false,
      backgroundColor: windowBackground(),
      show: false,
      title: 'LingoLeaf · 语叶',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    secureWindow(main);
    main.once('ready-to-show', () => main?.show());
    main.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        main?.hide();
      }
    });
    void load(main);
  } else {
    main.show();
    main.focus();
  }
}
function showPopup(activate = true) {
  if (!popup || popup.isDestroyed()) {
    popup = new BrowserWindow({
      width: 500,
      height: 620,
      minWidth: 440,
      minHeight: 360,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: windowBackground(),
      title: 'LingoLeaf · 划词助手',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    secureWindow(popup);
    popup.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        popup?.hide();
      }
    });
    void load(popup, 'popup');
  }
  const point = screen.getCursorScreenPoint(),
    area = screen.getDisplayNearestPoint(point).workArea;
  const width = Math.min(500, area.width),
    height = Math.min(620, area.height);
  popup.setBounds({
    width,
    height,
    x: Math.max(area.x, Math.min(point.x + 16, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(point.y + 20, area.y + area.height - height)),
  });
  if (activate) popup.show();
  else popup.showInactive();
}
function errorText(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? '输入无效。';
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
async function persist(result: Analysis, settings: Settings) {
  if (
    result.mode === 'translate' ||
    !result.isCorrect ||
    result.issues.length ||
    settings.saveCorrectSentences
  ) {
    const entry = await store.add(result, settings);
    broadcast();
    return entry.id;
  }
  return undefined;
}
async function hotkey(mode: Mode) {
  if (capturing) return;
  capturing = true;
  pending = undefined;
  try {
    const capture = await native.capture();
    if (capture.processId === process.pid)
      throw new Error('请先在其他应用中选中一句话，再按快捷键。也可以在主界面输入句子进行练习。');
    popup?.hide();
    const original = textInput.parse(capture.text);
    const requestSettings = store.getProviderSettings();
    publish({ status: 'loading', mode, original });
    // Keep the source focused throughout translation, so auto-replacement can validate its selection.
    if (mode === 'grammar' || !requestSettings.autoReplace) showPopup(false);
    const result = await analyzeText(original, mode, requestSettings);
    const entryId = await persist(result, requestSettings);
    let replaced = false,
      replacementUncertain = false,
      message = store.getSyncError() ?? undefined;
    if (mode === 'translate' && requestSettings.autoReplace && capture.canReplace) {
      try {
        const outcome = await native.replace(capture, result.corrected, false);
        replaced = outcome.ok;
        message = [message, outcome.message].filter(Boolean).join(' · ');
      } catch (error) {
        replacementUncertain = true;
        message = [message, errorText(error)].filter(Boolean).join(' · ');
      }
    } else if (mode === 'translate' && requestSettings.autoReplace && !capture.canReplace) {
      message = [message, '当前应用不支持安全替换，译文已准备好，可以复制使用。']
        .filter(Boolean)
        .join(' · ');
    }
    if (!replaced && !replacementUncertain && capture.canReplace)
      pending = { capture, result, at: Date.now() };
    publish({
      status: 'done',
      mode,
      original,
      result,
      entryId,
      replaced,
      canReplace: !!pending,
      message,
    });
    showPopup(true);
  } catch (error) {
    publish({ status: 'error', mode, message: errorText(error) });
    showPopup(true);
  } finally {
    capturing = false;
  }
}
function registerShortcuts(settings: Settings) {
  globalShortcut.unregisterAll();
  const next = { grammar: false, translate: false };
  try {
    next.grammar = globalShortcut.register(settings.grammarShortcut, () => void hotkey('grammar'));
  } catch {
    /* surfaced in UI */
  }
  try {
    next.translate = globalShortcut.register(
      settings.translateShortcut,
      () => void hotkey('translate'),
    );
  } catch {
    /* surfaced in UI */
  }
  shortcuts = next;
  return next.grammar && next.translate;
}
function handle(channel: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== main?.webContents && event.sender !== popup?.webContents)
      throw new Error('未知窗口。');
    try {
      return await handler(...args);
    } catch (error) {
      throw new Error(errorText(error));
    }
  });
}
function setupIPC() {
  handle('appearance:get', () => store.getAppearance());
  handle('appearance:save', async (value: unknown) => {
    const appearance = z
      .object({
        theme: z.enum(['system', 'forest', 'ocean', 'lavender', 'midnight']),
        fontSize: z.enum(['standard', 'large', 'extra-large']),
      })
      .strict()
      .parse(value);
    const saved = await store.saveAppearance(appearance);
    syncNativeTheme();
    broadcast();
    return saved;
  });
  handle('state:get', () => ({
    settings: store.getSettings(),
    entries: store.list(),
    shortcuts,
    version: app.getVersion(),
    syncError: store.getSyncError(),
  }));
  handle('result:get', () => latestResult);
  handle('analyze', async (value: unknown) => {
    const request = z.object({ text: textInput, mode: modeInput }).parse(value);
    const requestSettings = store.getProviderSettings();
    const result = await analyzeText(request.text, request.mode, requestSettings);
    await persist(result, requestSettings);
    return result;
  });
  handle('settings:save', async (value: unknown) => {
    const settings = settingsInput.parse(value),
      previous = store.getSettings();
    if (settings.grammarShortcut.toLowerCase() === settings.translateShortcut.toLowerCase())
      throw new Error('纠错和翻译需要使用不同的快捷键。');
    if (!registerShortcuts(settings)) {
      registerShortcuts(previous);
      throw new Error('快捷键已被占用或格式无效，请换一个组合。');
    }
    try {
      const saved = await store.saveSettings(settings);
      if (app.isPackaged)
        app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin, args: ['--hidden'] });
      broadcast();
      if (store.getSyncError())
        throw new Error('设置已保存，但 Markdown 同步失败：' + store.getSyncError());
      return saved;
    } catch (error) {
      registerShortcuts(store.getSettings());
      throw error;
    }
  });
  handle('provider:test', (value: unknown) => {
    const settings = settingsInput.parse(value),
      old = store.getProviderSettings();
    if (
      !settings.apiKey &&
      !settings.clearApiKey &&
      credentialScope(settings) === credentialScope(old)
    )
      settings.apiKey = old.apiKey;
    return testProvider(settings);
  });
  handle('library:choose', async () => {
    const result = await dialog.showOpenDialog(main!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择学习库目录（可以是 Obsidian 或云盘文件夹）',
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('library:open', async () => {
    await fs.mkdir(store.getLibraryDirectory(), { recursive: true });
    const error = await shell.openPath(store.getLibraryDirectory());
    if (error) throw new Error(error);
  });
  handle('entry:review', async (value: unknown) => {
    const { id, rating } = z.object({ id: z.string().max(100), rating: ratingInput }).parse(value);
    const result = await store.rate(id, rating);
    broadcast();
    return result;
  });
  handle('entry:delete', async (id: unknown) => {
    await store.remove(z.string().max(100).parse(id));
    broadcast();
  });
  handle('clipboard:copy', (text: unknown) => {
    clipboard.writeText(z.string().max(30000).parse(text));
  });
  handle('selection:replace', async () => {
    if (capturing) return { ok: false, message: '正在处理上一个选区，请稍候。' };
    if (!pending || Date.now() - pending.at > 120_000)
      return { ok: false, message: '选区已过期，请重新选中文字并按快捷键。' };
    capturing = true;
    const saved = pending;
    pending = undefined;
    try {
      popup?.hide();
      const outcome = await native.replace(saved.capture, saved.result.corrected, true);
      if (latestResult?.status === 'done')
        publish({
          ...latestResult,
          canReplace: false,
          replaced: outcome.ok,
          message: outcome.message,
        });
      return outcome;
    } catch (error) {
      const outcome = { ok: false, message: errorText(error) };
      if (latestResult?.status === 'done')
        publish({ ...latestResult, canReplace: false, replaced: false, message: outcome.message });
      return outcome;
    } finally {
      capturing = false;
      showPopup(true);
    }
  });
  handle('mobile:start', () => mobile.start());
  handle('mobile:stop', () => mobile.stop());
  handle('mobile:status', () => mobile.status());
  handle('library:export', async () => {
    const result = await dialog.showSaveDialog(main!, {
      defaultPath: 'LingoLeaf-learning-library.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const sections = store
      .list()
      .map((e) => {
        const translation =
          e.mode === 'grammar' && e.translation
            ? `句意${e.translationLanguage ? ` · ${escapeMd(e.translationLanguage)}` : ''}：\n\n${quote(e.translation)}\n\n`
            : '';
        return `## ${e.createdAt.slice(0, 10)} · ${e.mode === 'grammar' ? '语法纠错' : '翻译'}\n\n原句：\n\n${quote(e.original)}\n\n修改 / 译文：\n\n${quote(e.corrected)}\n\n${translation}${quote(e.explanation)}\n\n${e.issues.map((i) => `- **${escapeMd(i.rule)}**：${escapeMd(i.original)} → ${escapeMd(i.replacement)}\n  ${escapeMd(i.explanation)}`).join('\n')}\n\n例句：${escapeMd(e.example)}\n\n下次复习：${e.review.dueAt}\n`;
      });
    await fs.writeFile(
      result.filePath,
      '# LingoLeaf · 我的语言学习库\n\n' + sections.join('\n---\n\n'),
      'utf8',
    );
    return result.filePath;
  });
  for (const event of ['window:minimize', 'window:close', 'window:main'])
    ipcMain.on(event, (sender) => {
      const w = BrowserWindow.fromWebContents(sender.sender);
      if (w !== main && w !== popup) return;
      if (event === 'window:main') {
        popup?.hide();
        showMain();
      } else if (event === 'window:minimize') w?.minimize();
      else w?.hide();
    });
}
function escapeMd(text: string) {
  return text.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ');
}
function quote(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => '> ' + escapeMd(line))
    .join('\n');
}

app.commandLine.appendSwitch('force-renderer-accessibility');
if (process.env.LINGOLEAF_DATA_DIR && !app.isPackaged)
  app.setPath('userData', path.resolve(process.env.LINGOLEAF_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit')) {
      quitting = true;
      app.quit();
    } else showMain();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      store = new LibraryStore(
        app.getPath('userData'),
        (value) => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error('Windows 凭据加密暂不可用，无法保存 API Key。');
          return safeStorage.encryptString(value).toString('base64');
        },
        (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
      );
      await store.init();
      syncNativeTheme();
      native = new NativeService(
        app.isPackaged
          ? path.join(process.resourcesPath, 'native')
          : path.join(app.getAppPath(), 'native'),
      );
      void native.ready().catch(() => {
        /* capture reports the actionable error when requested */
      });
      mobile = new MobileServer(store, broadcast);
      setupIPC();
      nativeTheme.on('updated', applyNativeAppearance);
      registerShortcuts(store.getSettings());
      const icon = nativeImage.createFromPath(
        app.isPackaged
          ? path.join(process.resourcesPath, 'icon.png')
          : path.join(app.getAppPath(), 'assets/icon.png'),
      );
      tray = new Tray(icon);
      tray.setToolTip('LingoLeaf · 选中一句话，开始学习');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: '打开 LingoLeaf', click: showMain },
          { type: 'separator' },
          {
            label: '退出',
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on('double-click', showMain);
      if (!process.argv.includes('--hidden')) showMain();
    })
    .catch((error) => {
      dialog.showErrorBox('LingoLeaf 启动失败', errorText(error));
      app.quit();
    });
  app.on('window-all-closed', () => {
    /* Tray companion intentionally remains available. */
  });
  app.on('before-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    native?.dispose();
    void mobile?.stop();
  });
}

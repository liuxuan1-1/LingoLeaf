import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { analysisSchema, PROVIDER_DEFAULTS } from './providers';
import { initialReview, scheduleReview } from '../shared/scheduler';
import type { Analysis, AppearanceSettings, Entry, Rating, Settings } from '../shared/types';

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  requestProtocol: 'auto',
  endpoint: PROVIDER_DEFAULTS.openai.endpoint,
  model: PROVIDER_DEFAULTS.openai.model,
  apiKey: '',
  hasApiKey: false,
  azureApiVersion: '2024-10-21',
  targetLanguage: 'English',
  explanationLanguage: '简体中文',
  grammarShortcut: 'CommandOrControl+Shift+G',
  translateShortcut: 'CommandOrControl+Shift+T',
  libraryPath: '',
  autoReplace: true,
  launchAtLogin: false,
  saveCorrectSentences: false,
  theme: 'forest',
  fontSize: 'large',
};

const appearanceSchema = z
  .object({
    theme: z.enum(['system', 'forest', 'ocean', 'lavender', 'midnight']),
    fontSize: z.enum(['standard', 'large', 'extra-large']),
  })
  .strict();

const settingsSchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'azure', 'ollama', 'compatible']),
    requestProtocol: z.enum(['auto', 'chat-completions', 'responses']).default('auto'),
    endpoint: z.string().max(2000),
    model: z.string().max(200),
    apiKey: z.string().max(16000),
    hasApiKey: z.boolean(),
    azureApiVersion: z.string().max(100),
    targetLanguage: z.string().trim().min(1).max(100),
    explanationLanguage: z.string().trim().min(1).max(100),
    grammarShortcut: z.string().min(1).max(100),
    translateShortcut: z.string().min(1).max(100),
    libraryPath: z
      .string()
      .max(4000)
      .refine((value) => path.isAbsolute(value)),
    autoReplace: z.boolean(),
    launchAtLogin: z.boolean(),
    saveCorrectSentences: z.boolean(),
    clearApiKey: z.boolean().optional(),
    theme: appearanceSchema.shape.theme.default('forest'),
    fontSize: appearanceSchema.shape.fontSize.default('large'),
  })
  .strict();

const reviewSchema = z
  .object({
    dueAt: z.string().datetime(),
    interval: z.number().finite().min(0).max(3650),
    ease: z.number().finite().min(1.3).max(3.5),
    repetitions: z.number().int().min(0).max(1000000),
    lastReviewedAt: z.string().datetime().nullable(),
  })
  .strict();
const entrySchema = analysisSchema
  .extend({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    review: reviewSchema,
    sourceLanguage: z.string().max(100),
    targetLanguage: z.string().max(100),
  })
  .strict();
const librarySchema = z
  .object({ version: z.literal(1), entries: z.array(entrySchema).max(100000) })
  .strict();
const configSchema = z
  .object({ version: z.literal(1), settings: settingsSchema, credentials: z.record(z.string()) })
  .strict();

export function credentialScope(settings: Pick<Settings, 'provider' | 'endpoint'>): string {
  const endpoint = (
    settings.endpoint.trim() || PROVIDER_DEFAULTS[settings.provider].endpoint
  ).replace(/\/+$/, '');
  return `${settings.provider}:${endpoint}`;
}

function plain(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');
}
function quote(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${plain(line)}`)
    .join('\n');
}
function literal(value: string): string {
  const runs = value.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}text\n${value}\n${fence}`;
}
function entryFilename(entry: Entry): string {
  return `${entry.createdAt.slice(0, 10)}-${entry.id}.md`;
}

export function renderEntryMarkdown(entry: Entry): string {
  const issueText = entry.issues.length
    ? entry.issues
        .map(
          (issue, index) =>
            `### ${index + 1}. ${issue.kind === 'grammar' ? '语法' : '表达建议'} · ${plain(issue.rule)}\n\n**原文片段**\n\n${literal(issue.original)}\n\n**建议片段**\n\n${literal(issue.replacement)}\n\n${quote(issue.explanation)}`,
        )
        .join('\n\n')
    : '没有需要纠正的语法错误。';
  return (
    `# ${entry.mode === 'grammar' ? '语法学习' : '翻译学习'} · ${entry.createdAt.slice(0, 10)}\n\n` +
    `<!-- LingoLeaf entry ${entry.id}; immutable learning note. Personal annotations may be added below. -->\n\n` +
    `- 创建时间：${entry.createdAt}\n- 目标语言：${plain(entry.targetLanguage)}\n- 学习主题：${entry.tags.map(plain).join(' · ') || '日常表达'}\n\n` +
    `## 先回忆\n\n阅读原句，先自己${entry.mode === 'grammar' ? '判断语法并尝试修改' : '说出译文'}，再看下面的答案。\n\n` +
    `## 原句\n\n${literal(entry.original)}\n\n## ${entry.mode === 'grammar' ? '正确表达' : '译文'}\n\n${literal(entry.corrected)}\n\n` +
    (entry.mode === 'grammar' && entry.translation
      ? `## 译文${entry.translationLanguage ? ` · ${plain(entry.translationLanguage)}` : ''}\n\n${literal(entry.translation)}\n\n`
      : '') +
    `## 理解原因\n\n${quote(entry.explanation)}\n\n${entry.mode === 'grammar' ? `## 逐项解析\n\n${issueText}\n\n` : ''}` +
    `## 举一反三\n\n${quote(entry.example || '用同样的规则，写一句和自己有关的新句子。')}\n\n` +
    `## 主动练习\n\n- [ ] 不看答案，重新写出正确表达。\n- [ ] 用相同规则写一个自己的例句。\n- [ ] 在 LingoLeaf 的复习页评价记忆程度，安排下一次复习。\n\n` +
    `复习时间以 LingoLeaf 应用和 [学习索引](../index.md) 为准。本文件保留为可自由批注的学习笔记。\n\n## 我的笔记\n\n`
  );
}

function renderIndex(entries: Entry[]): string {
  const now = Date.now();
  const due = entries
    .filter((entry) => Date.parse(entry.review.dueAt) <= now)
    .sort((a, b) => a.review.dueAt.localeCompare(b.review.dueAt));
  const links = (items: Entry[]) =>
    items
      .map(
        (entry) =>
          `- [${plain(entry.original.replace(/\s+/g, ' ').slice(0, 100))}](entries/${entryFilename(entry)}) · ${entry.mode === 'grammar' ? '语法' : '翻译'} · 下次复习 ${entry.review.dueAt.slice(0, 16).replace('T', ' ')} UTC`,
      )
      .join('\n') || '暂无条目。';
  return (
    `# LingoLeaf 学习库\n\n<!-- Generated by LingoLeaf. This index is refreshed automatically; add personal notes inside an entry. -->\n\n` +
    `共 ${entries.length} 个学习条目 · 更新于 ${new Date().toISOString()}\n\n` +
    `## 如何学习\n\n1. 先读原句，回忆正确表达或译文。\n2. 看答案，理解具体规则，再造一个自己的句子。\n3. 在桌面或手机复习页选择“忘记 / 困难 / 记住 / 轻松”，自动安排下一次复习。\n\n` +
    `## 到期复习\n\n${links(due)}\n\n## 全部笔记\n\n${links([...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))}\n\n` +
    `## 手机同步\n\n可把学习目录放入 OneDrive、iCloud Drive、Dropbox 等已有同步目录，在手机 Markdown 阅读器中打开。` +
    `每条笔记独立保存，批注不会被应用覆盖；本索引会自动刷新。\n\n` +
    `复习进度保存在此电脑的本地数据库中。文件夹同步用于阅读与批注，不会导入手机对 Markdown 的修改为复习进度。` +
    `在同一受信任局域网中，使用应用内“手机复习”功能可直接更新桌面复习进度。\n`
  );
}

async function atomicWrite(filename: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, filename);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
}

async function atomicCreate(filename: string, content: string): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    // link is an atomic exclusive create: an existing annotated note is never replaced.
    await fs.link(temporary, filename);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
}

async function readIfExists(filename: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`无法读取 ${path.basename(filename)}。原文件已保留，请检查权限或从备份恢复。`);
  }
}

/** Local JSON is the authority. Markdown is an editable, one-way learning mirror. */
export class LibraryStore {
  private settings: Settings;
  private credentials: Record<string, string> = {};
  private entries: Entry[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private syncError: string | null = null;

  constructor(
    private readonly baseDir: string,
    private readonly protect: (value: string) => string,
    private readonly unprotect: (value: string) => string,
  ) {
    this.baseDir = path.resolve(baseDir);
    this.settings = { ...DEFAULT_SETTINGS, libraryPath: path.join(this.baseDir, 'notes') };
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.baseDir, { recursive: true });
    const config = await readIfExists(path.join(this.baseDir, 'settings.json'));
    if (config !== null) {
      const parsed = configSchema.safeParse(config);
      if (!parsed.success)
        throw new Error('设置文件格式无效。原文件已保留，请从备份恢复 settings.json。');
      const { clearApiKey: _clear, ...saved } = parsed.data.settings;
      this.settings = { ...saved, apiKey: '', hasApiKey: false };
      try {
        this.credentials = Object.fromEntries(
          Object.entries(parsed.data.credentials).map(([key, value]) => [
            key,
            this.unprotect(value),
          ]),
        );
      } catch {
        throw new Error(
          '无法解密已保存的 API Key。请在原 Windows 用户账户中打开，或备份后重新配置密钥。',
        );
      }
    }
    const library = await readIfExists(path.join(this.baseDir, 'library.json'));
    if (library !== null) {
      const parsed = librarySchema.safeParse(library);
      if (
        !parsed.success ||
        new Set(parsed.data.entries.map((entry) => entry.id)).size !== parsed.data.entries.length
      ) {
        throw new Error('学习库格式无效。原文件已保留，请从备份恢复 library.json。');
      }
      this.entries = parsed.data.entries;
    }
    if (!config) await this.persistSettings(this.settings, this.credentials);
    if (!library) await this.persistEntries(this.entries);
    this.initialized = true;
    await this.refreshMirror();
  }

  getSettings(): Settings {
    return {
      ...this.settings,
      apiKey: '',
      hasApiKey: Boolean(this.credentials[credentialScope(this.settings)]),
    };
  }
  getProviderSettings(): Settings {
    return {
      ...this.getSettings(),
      apiKey: this.credentials[credentialScope(this.settings)] || '',
    };
  }
  getAppearance(): AppearanceSettings {
    return {
      theme: this.settings.theme ?? 'forest',
      fontSize: this.settings.fontSize ?? 'large',
    };
  }
  async saveAppearance(value: AppearanceSettings): Promise<AppearanceSettings> {
    return this.serial(async () => {
      const result = appearanceSchema.safeParse(value);
      if (!result.success) throw new Error('外观设置无效，请检查主题和字号。');
      const settings = { ...this.settings, ...result.data };
      await this.persistSettings(settings, this.credentials);
      this.settings = settings;
      return this.getAppearance();
    });
  }
  getLibraryDirectory(): string {
    return path.join(this.settings.libraryPath, 'LingoLeaf');
  }
  getSyncError(): string | null {
    return this.syncError;
  }
  list(): Entry[] {
    return structuredClone(
      [...this.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async saveSettings(value: Settings): Promise<Settings> {
    return this.serial(async () => {
      // Appearance has its own scoped save API. A stale full-settings draft must
      // not overwrite appearance changes committed while that draft was open.
      const result = settingsSchema.safeParse({ ...value, ...this.getAppearance() });
      if (!result.success) throw new Error('设置格式无效，请检查输入。');
      const { clearApiKey, ...settings } = result.data;
      if (!path.isAbsolute(settings.libraryPath)) throw new Error('请选择一个有效的学习库文件夹。');
      if (settings.grammarShortcut.toLowerCase() === settings.translateShortcut.toLowerCase())
        throw new Error('语法和翻译快捷键不能相同。');
      const credentials = { ...this.credentials };
      const scope = credentialScope(settings);
      if (clearApiKey) delete credentials[scope];
      else if (settings.apiKey.trim()) credentials[scope] = settings.apiKey.trim();
      const publicSettings = { ...settings, apiKey: '', hasApiKey: false };
      // Verify the selected folder before accepting it as the active mirror.
      if (settings.libraryPath !== this.settings.libraryPath)
        await this.writeMirror(publicSettings);
      await this.persistSettings(publicSettings, credentials);
      this.settings = publicSettings;
      this.credentials = credentials;
      await this.refreshMirror();
      return this.getSettings();
    });
  }

  async setLibraryPath(directory: string): Promise<void> {
    await this.saveSettings({ ...this.getSettings(), libraryPath: directory });
  }

  async add(analysis: Analysis, settings: Settings): Promise<Entry> {
    return this.serial(async () => {
      const validated = analysisSchema.safeParse(analysis);
      if (!validated.success) throw new Error('学习内容格式无效，未写入学习库。');
      const content = validated.data;
      if (content.mode === 'grammar' && content.translation) {
        content.translationLanguage = settings.explanationLanguage.trim() || '简体中文';
      } else {
        delete content.translation;
        delete content.translationLanguage;
      }
      const timestamp = new Date();
      const entry: Entry = {
        ...content,
        id: randomUUID(),
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
        review: initialReview(timestamp),
        sourceLanguage: analysis.mode === 'grammar' ? 'English' : 'Auto',
        targetLanguage: analysis.mode === 'grammar' ? 'English' : settings.targetLanguage,
      };
      const entries = [...this.entries, entry];
      await this.persistEntries(entries);
      this.entries = entries;
      await this.refreshMirror();
      return structuredClone(entry);
    });
  }

  async rate(id: string, rating: Rating): Promise<Entry> {
    return this.serial(async () => {
      const entry = this.entries.find((item) => item.id === id);
      if (!entry) throw new Error('这个学习条目已不存在。');
      const timestamp = new Date();
      const updated = {
        ...entry,
        updatedAt: timestamp.toISOString(),
        review: scheduleReview(entry.review, rating, timestamp),
      };
      const entries = this.entries.map((item) => (item.id === id ? updated : item));
      await this.persistEntries(entries);
      this.entries = entries;
      await this.refreshMirror();
      return structuredClone(updated);
    });
  }

  async remove(id: string): Promise<void> {
    return this.serial(async () => {
      const entry = this.entries.find((item) => item.id === id);
      if (!entry) return;
      const entries = this.entries.filter((item) => item.id !== id);
      await this.persistEntries(entries);
      this.entries = entries;
      try {
        await fs.rm(path.join(this.getLibraryDirectory(), 'entries', entryFilename(entry)), {
          force: true,
        });
        await this.refreshMirror();
      } catch {
        this.syncError = '条目已从应用删除，但 Markdown 文件尚未删除。请检查学习目录权限。';
      }
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (!this.initialized) throw new Error('学习库尚未初始化。');
      return operation();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async persistSettings(
    settings: Settings,
    credentials: Record<string, string>,
  ): Promise<void> {
    const encrypted = Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => [key, this.protect(value)]),
    );
    await atomicWrite(
      path.join(this.baseDir, 'settings.json'),
      JSON.stringify({ version: 1, settings, credentials: encrypted }, null, 2),
    );
  }
  private async persistEntries(entries: Entry[]): Promise<void> {
    await atomicWrite(
      path.join(this.baseDir, 'library.json'),
      JSON.stringify({ version: 1, entries }, null, 2),
    );
  }
  private async refreshMirror(): Promise<void> {
    try {
      await this.writeMirror(this.settings);
      this.syncError = null;
    } catch {
      this.syncError =
        '学习内容已保存在此电脑，但 Markdown 同步失败。请检查学习目录是否在线、可写。';
    }
  }
  private async writeMirror(settings: Settings): Promise<void> {
    const directory = path.join(settings.libraryPath, 'LingoLeaf');
    await fs.mkdir(path.join(directory, 'entries'), { recursive: true });
    for (const entry of this.entries) {
      const filename = path.join(directory, 'entries', entryFilename(entry));
      try {
        // Never overwrite personal annotations in existing per-entry Markdown.
        await fs.access(filename);
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      try {
        await atomicCreate(filename, renderEntryMarkdown(entry));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    await atomicWrite(path.join(directory, 'index.md'), renderIndex(this.entries));
  }
}

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { randomUUID } from 'node:crypto';

/** Opaque id is resolved in the helper; HWNDs and UI Automation objects never enter the renderer. */
export interface NativeCapture {
  id: string;
  text: string;
  appName: string;
  /** Actual foreground window's process id, independent of Electron's cached focus state. */
  processId: number;
  method: 'uia' | 'clipboard';
  canReplace: boolean;
  capturedAt: string;
  replacementHint: string;
}

export interface ReplacementResult { ok: boolean; message: string }

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Validate the process boundary; a malformed response must never enable replacement. */
export function parseNativeCapture(value: unknown): NativeCapture {
  if (!value || typeof value !== 'object') throw new Error('Windows 选区返回了无效数据。');
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !/^[a-f0-9]{32}$/.test(item.id) ||
      typeof item.text !== 'string' || !item.text.trim() || item.text.length > 20000 ||
      typeof item.appName !== 'string' || item.appName.length > 512 ||
      typeof item.processId !== 'number' || !Number.isInteger(item.processId) || item.processId <= 0 || item.processId > 0xFFFFFFFF ||
      !['uia', 'clipboard'].includes(String(item.method)) ||
      typeof item.canReplace !== 'boolean' ||
      (item.method === 'clipboard' && item.canReplace) ||
      typeof item.capturedAt !== 'string' || !Number.isFinite(Date.parse(item.capturedAt)) ||
      typeof item.replacementHint !== 'string') {
    throw new Error('Windows 选区返回了无效数据。请重新选中文字。');
  }
  return item as unknown as NativeCapture;
}

export function parseReplacementResult(value: unknown): ReplacementResult {
  if (!value || typeof value !== 'object' ||
      typeof (value as ReplacementResult).ok !== 'boolean' ||
      typeof (value as ReplacementResult).message !== 'string')
    throw new Error('未能确认替换结果。请先检查原应用，避免重复替换。');
  return value as ReplacementResult;
}

/** A hidden, STA Windows PowerShell child is the sole owner of native selection / clipboard actions. */
export class NativeService {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private starting?: Promise<void>;
  private pending = new Map<string, Pending>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly resourcePath: string) {}

  ready(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Windows 选区服务已关闭。'));
    if (process.platform !== 'win32') return Promise.reject(new Error('全局选区功能目前仅支持 Windows。'));
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const child = spawn(executable, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-File', join(this.resourcePath, 'windows-helper.ps1'),
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      child.stdin.setDefaultEncoding('utf8');
      child.stdout.setEncoding('utf8');
      // Consume diagnostics without logging selected text or credentials.
      child.stderr.resume();
      const startupTimer = setTimeout(() => {
        reject(new Error('Windows 选区服务启动超时，请重试。'));
        child.kill();
      }, 20000);
      let ready = false;
      this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      this.lines.on('line', (line: string) => {
        let message: Record<string, unknown>;
        try { message = JSON.parse(line) as Record<string, unknown>; } catch { return; }
        if (message.event === 'ready' && message.protocol === 1) {
          ready = true; clearTimeout(startupTimer); resolve(); return;
        }
        const request = this.pending.get(String(message.id));
        if (!request) return;
        this.pending.delete(String(message.id));
        clearTimeout(request.timer);
        if (message.ok === true) request.resolve(message.result);
        else request.reject(new Error(typeof message.error === 'string' ? message.error : 'Windows 选区操作失败。'));
      });
      const ended = (error: Error) => {
        clearTimeout(startupTimer);
        if (!ready) reject(error);
        if (this.child === child) {
          this.child = undefined;
          this.starting = undefined;
          this.lines?.close();
          this.lines = undefined;
          for (const request of this.pending.values()) {
            clearTimeout(request.timer); request.reject(error);
          }
          this.pending.clear();
        }
      };
      child.once('error', () => ended(new Error('无法启动 Windows 选区服务，请确认 Windows PowerShell 可用。')));
      child.once('exit', () => ended(new Error('Windows 选区服务已退出。请重新选中文字。')));
      child.stdin.on('error', () => { /* Process exit is handled above. */ });
    });
    return this.starting;
  }

  async capture(): Promise<NativeCapture> {
    return this.serial(async () => parseNativeCapture(await this.request('capture')));
  }

  /** restoreFocus must only be true for an explicit popup Replace click, never automatic translation. */
  async replace(capture: NativeCapture, text: string, restoreFocus = false): Promise<ReplacementResult> {
    parseNativeCapture(capture);
    if (!capture.canReplace) return { ok: false, message: capture.replacementHint || '当前选区不支持安全替换，请复制结果。' };
    if (!text || text.length > 20000 || text.includes('\0')) return { ok: false, message: '替换内容为空、过长或含有不支持的字符。' };
    return this.serial(async () => parseReplacementResult(await this.request('replace', {
      captureId: capture.id, text, restoreFocus: restoreFocus === true,
    })));
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work, work);
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async request(op: 'capture' | 'replace', fields: Record<string, unknown> = {}): Promise<unknown> {
    await this.ready();
    if (!this.child || this.disposed) throw new Error('Windows 选区服务已关闭。');
    const child = this.child;
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // No automatic retry: a previous paste may already have been delivered.
        child.kill();
        reject(new Error(op === 'replace'
          ? '替换操作超时。请先检查原应用中的内容，避免重复替换。'
          : '读取选区超时，请重新选中文字。'));
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      // The helper checks this deadline again immediately before submitting any input.
      child.stdin.write(JSON.stringify({ id, op, deadline: Date.now() + 5500, ...fields }) + '\n', 'utf8', (error) => {
        if (!error) return;
        const request = this.pending.get(id);
        if (request) { clearTimeout(request.timer); this.pending.delete(id); request.reject(new Error('无法连接 Windows 选区服务。')); }
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    const child = this.child;
    if (child) {
      // EOF lets an in-flight native operation restore the clipboard in its finally block.
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 7000);
      timer.unref();
      child.once('exit', () => clearTimeout(timer));
    }
  }
}

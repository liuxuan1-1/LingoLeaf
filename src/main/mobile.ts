import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import type { Entry, MobileStatus, Rating } from '../shared/types';
import { MOBILE_HTML } from './mobile-page';

interface MobileStore {
  list(): Entry[];
  rate(id: string, rating: Rating): Promise<Entry>;
}
function addressPriority(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  const octets = address.split('.').map(Number);
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return 2;
  return 3;
}
export class MobileServer {
  private server?: Server;
  private token = '';
  private statusValue: MobileStatus = { running: false, urls: [] };
  private lifecycle: Promise<unknown> = Promise.resolve();
  constructor(
    private store: MobileStore,
    private changed: () => void = () => {},
  ) {}
  status(): MobileStatus {
    return { ...this.statusValue, urls: [...this.statusValue.urls] };
  }
  async start(host = '0.0.0.0'): Promise<MobileStatus> {
    return this.serial(async () => {
      if (this.server) return this.status();
      this.token = randomBytes(32).toString('base64url');
      const server = createServer((req, res) => {
        void this.handle(req, res).catch(() => {
          if (res.destroyed || res.writableEnded) return;
          if (!res.headersSent) this.json(res, 500, { error: '暂时无法读取学习库，请稍后重试。' });
          else res.end();
        });
      });
      server.requestTimeout = 10_000;
      server.headersTimeout = 10_000;
      this.server = server;
      try {
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error) => reject(error);
          server.once('error', failed);
          server.listen(0, host, () => {
            server.removeListener('error', failed);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('手机连接启动失败。');
        const addresses = !['0.0.0.0', '::'].includes(host)
          ? [host]
          : Object.values(networkInterfaces())
              .flat()
              .filter(
                (i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'),
              )
              .map((i) => i!.address);
        const ordered = [...new Set(addresses.length ? addresses : ['127.0.0.1'])].sort(
          (a, b) =>
            addressPriority(a) - addressPriority(b) ||
            a.localeCompare(b, undefined, { numeric: true }),
        );
        const urls = ordered.map(
          (ip) => `http://${ip.includes(':') ? `[${ip}]` : ip}:${address.port}/#${this.token}`,
        );
        const qrDataUrl = await QRCode.toDataURL(urls[0], {
          width: 240,
          margin: 2,
          color: { dark: '#234b40', light: '#ffffff' },
        });
        this.statusValue = { running: true, urls, qrDataUrl };
        return this.status();
      } catch (error) {
        this.server = undefined;
        this.token = '';
        this.statusValue = { running: false, urls: [] };
        await this.close(server);
        throw error;
      }
    });
  }
  async stop(): Promise<MobileStatus> {
    return this.serial(async () => {
      const server = this.server;
      this.server = undefined;
      this.token = '';
      this.statusValue = { running: false, urls: [] };
      if (server) await this.close(server);
      return this.status();
    });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lifecycle.then(operation);
    this.lifecycle = next.catch(() => undefined);
    return next;
  }
  private async close(server: Server): Promise<void> {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
  private rejectBody(req: IncomingMessage, res: ServerResponse, status: number, error: string) {
    res.setHeader('Connection', 'close');
    this.json(res, status, { error });
    req.resume();
  }
  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    const route = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && route === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(MOBILE_HTML);
      return;
    }
    const supplied = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const expected = Buffer.from(this.token);
    if (
      !expected.length ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      this.json(res, 401, { error: '连接已失效，请重新扫描桌面的二维码。' });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      this.json(res, 403, { error: '不允许跨站请求。' });
      return;
    }
    if (req.method === 'GET' && route === '/api/entries') {
      this.json(res, 200, { entries: this.store.list(), now: new Date().toISOString() });
      return;
    }
    if (req.method === 'POST' && route === '/api/review') {
      if (
        (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !==
        'application/json'
      ) {
        this.rejectBody(req, res, 415, '需要 JSON 请求。');
        return;
      }
      if (Number(req.headers['content-length'] ?? 0) > 4096) {
        this.rejectBody(req, res, 413, '请求过大。');
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      // Keep the socket alive long enough to deliver 413 before closing oversized chunked requests.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > 4096) {
          this.rejectBody(req, res, 413, '请求过大。');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let value: { id?: unknown; rating?: unknown };
      try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        this.json(res, 400, { error: '请求格式错误。' });
        return;
      }
      if (
        !value ||
        typeof value.id !== 'string' ||
        !value.id ||
        value.id.length > 100 ||
        typeof value.rating !== 'string' ||
        !['again', 'hard', 'good', 'easy'].includes(value.rating)
      ) {
        this.json(res, 400, { error: '复习信息无效。' });
        return;
      }
      if (!this.store.list().some((entry) => entry.id === value.id)) {
        this.json(res, 404, { error: '这条记录已不存在，请刷新。' });
        return;
      }
      let entry: Entry;
      try {
        entry = await this.store.rate(value.id, value.rating as Rating);
      } catch {
        if (!this.store.list().some((item) => item.id === value.id))
          this.json(res, 404, { error: '这条记录已不存在，请刷新。' });
        else this.json(res, 500, { error: '复习进度未能保存，请检查桌面学习库后重试。' });
        return;
      }
      // A notification failure must not turn a successfully committed review into an apparent failure.
      try {
        this.changed();
      } catch {
        /* the next desktop refresh reads the committed record */
      }
      this.json(res, 200, { entry, now: new Date().toISOString() });
      return;
    }
    this.json(res, 404, { error: '未找到。' });
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { promises as fs } from 'node:fs';
import os, { networkInterfaces } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import QRCode from 'qrcode';
import { MobileServer } from '../src/main/mobile';
import { MOBILE_HTML } from '../src/main/mobile-page';
import { LibraryStore } from '../src/main/store';
import type { Entry, Rating } from '../src/shared/types';
import { initialReview, scheduleReview } from '../src/shared/scheduler';

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, networkInterfaces: vi.fn(actual.networkInterfaces) };
});

const entry: Entry = { id:'8786bc64-e37f-4c47-9bc1-1b0847586521',mode:'grammar',original:'She go to school.',corrected:'She goes to school.',isCorrect:false,explanation:'第三人称单数用 goes。',issues:[{original:'go',replacement:'goes',explanation:'主语是第三人称单数。',rule:'主谓一致',kind:'grammar'}],tags:['主谓一致'],example:'He works here.',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),review:initialReview(),sourceLanguage:'English',targetLanguage:'English' };
const servers: MobileServer[]=[];
const directories: string[] = [];
async function fixture() {
  let items=[structuredClone(entry)];let changes=0;
  const server=new MobileServer({list:()=>structuredClone(items),rate:async(id:string,rating:Rating)=>{if(id!==entry.id)throw Error('missing');items=[{...items[0],review:scheduleReview(items[0].review,rating)}];return items[0];}},()=>{changes++});servers.push(server);
  const status=await server.start('127.0.0.1');const url=new URL(status.urls[0]);const token=url.hash.slice(1);url.hash='';
  return {server,url:url.origin,token,changes:()=>changes};
}
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(servers.splice(0).map(server=>server.stop()));await Promise.all(directories.splice(0).map(directory=>fs.rm(directory,{recursive:true,force:true})));});
describe('paired mobile learning',()=>{
  it('serves a responsive companion without exposing learning data or token in its page',async()=>{const f=await fixture();const r=await fetch(f.url);const page=await r.text();expect(r.status).toBe(200);expect(page).toContain('viewport');expect(page).not.toContain(f.token);expect(page).not.toContain(entry.original);expect(r.headers.get('referrer-policy')).toBe('no-referrer');});
  it('requires pairing before reading and rejects a forged token',async()=>{const f=await fixture();for(const auth of ['', 'Bearer bad']){const r=await fetch(f.url+'/api/entries',{headers:{authorization:auth}});expect(r.status).toBe(401);}const r=await fetch(f.url+'/api/entries',{headers:{authorization:'Bearer '+f.token}});expect(r.status).toBe(200);expect((await r.json()).entries[0].original).toBe(entry.original);});
  it('writes phone review to the same desktop authority and broadcasts a change',async()=>{const f=await fixture();const r=await fetch(f.url+'/api/review',{method:'POST',headers:{authorization:'Bearer '+f.token,'content-type':'application/json'},body:JSON.stringify({id:entry.id,rating:'good'})});expect(r.status).toBe(200);const reviewed=(await r.json()).entry;expect(Date.parse(reviewed.review.dueAt)).toBeGreaterThan(Date.now());expect(f.changes()).toBe(1);const state=await(await fetch(f.url+'/api/entries',{headers:{authorization:'Bearer '+f.token}})).json();expect(state.entries[0].review).toEqual(reviewed.review);});
  it('rejects cross-origin writes and invalid ratings without changing progress',async()=>{const f=await fixture();for(const [origin,rating,code] of [[f.url,'unknown',400],['http://untrusted.invalid','good',403]]){const r=await fetch(f.url+'/api/review',{method:'POST',headers:{authorization:'Bearer '+f.token,'content-type':'application/json',origin:String(origin)},body:JSON.stringify({id:entry.id,rating})});expect(r.status).toBe(code);}expect(f.changes()).toBe(0);});
  it('rotates pairing token after stop and restarts',async()=>{const f=await fixture();await f.server.stop();expect(f.server.status().running).toBe(false);const next=await f.server.start('127.0.0.1');const url=new URL(next.urls[0]);expect(url.hash.slice(1)).not.toBe(f.token);url.hash='';expect((await fetch(url.origin+'/api/entries',{headers:{authorization:'Bearer '+f.token}})).status).toBe(401);});
});

async function sendChunks(url: string, token: string, chunks: Buffer[]) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const request = httpRequest(url + '/api/review', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } }, response => {
      const received: Buffer[] = [];
      response.on('data', chunk => received.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ status: response.statusCode || 0, body: JSON.parse(Buffer.concat(received).toString('utf8')) }));
    });
    request.on('error', reject);
    request.flushHeaders();
    void (async () => {
      for (const chunk of chunks) {
        if (request.destroyed) return;
        request.write(chunk);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      request.end();
    })();
  });
}

describe('mobile lifecycle and request boundaries', () => {
  it('shares a completed start across simultaneous callers and serializes stop during startup', async () => {
    const server = new MobileServer({ list: () => [], rate: async () => { throw new Error('unused'); } });
    servers.push(server);
    const starts = [server.start('127.0.0.1'), server.start('127.0.0.1')];
    const stopped = server.stop();
    const [first, second] = await Promise.all(starts);
    expect(first.running).toBe(true);
    expect(second.urls).toEqual(first.urls);
    expect(await stopped).toEqual({ running: false, urls: [] });
    expect(server.status().running).toBe(false);
    const fresh = await server.start('127.0.0.1');
    expect(new URL(fresh.urls[0]).hash).not.toBe(new URL(first.urls[0]).hash);
  });
  it('recovers from QR startup failure without leaving a running server or poisoning later starts', async () => {
    const server = new MobileServer({ list: () => [], rate: async () => { throw new Error('unused'); } });
    servers.push(server);
    vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('QR generation failed'));
    await expect(server.start('127.0.0.1')).rejects.toThrow('QR generation failed');
    expect(server.status()).toEqual({ running: false, urls: [] });
    expect((await server.start('127.0.0.1')).running).toBe(true);
  });
  it('returns a detached status so callers cannot change active pairing URLs', async () => {
    const f = await fixture();
    const status = f.server.status();
    status.urls.length = 0;
    expect(f.server.status().urls).toHaveLength(1);
  });
  it('prefers private LAN addresses over VPN/public interfaces in the pairing QR', async () => {
    const nic = (address: string): os.NetworkInterfaceInfo => ({ address, family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: address + '/24' });
    vi.mocked(networkInterfaces).mockReturnValueOnce({ vpn: [nic('100.64.0.1')], other: [nic('10.1.2.3')], wifi: [nic('192.168.50.4')], unavailable: [nic('169.254.1.1')] });
    const server = new MobileServer({ list: () => [], rate: async () => { throw new Error('unused'); } });
    servers.push(server);
    const status = await server.start();
    expect(status.urls.map(value => new URL(value).hostname)).toEqual(['192.168.50.4', '10.1.2.3', '100.64.0.1']);
  });
  it('rejects invalid body types and oversized fixed/chunked bodies with explicit HTTP status', async () => {
    const f = await fixture();
    for (const rating of [['good'], {}, null, 1]) {
      const response = await fetch(f.url + '/api/review', { method: 'POST', headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/json' }, body: JSON.stringify({ id: entry.id, rating }) });
      expect(response.status).toBe(400);
    }
    const wrongType = await fetch(f.url + '/api/review', { method: 'POST', headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/jsonp' }, body: '{}' });
    expect(wrongType.status).toBe(415);
    const oversized = await fetch(f.url + '/api/review', { method: 'POST', headers: { authorization: 'Bearer ' + f.token, 'content-type': 'application/json' }, body: 'x'.repeat(4097) });
    expect(oversized.status).toBe(413);
    expect((await sendChunks(f.url, f.token, [Buffer.alloc(2048, 'x'), Buffer.alloc(2048, 'x'), Buffer.alloc(1, 'x')])).status).toBe(413);
    expect(f.changes()).toBe(0);
  });
  it('decodes split UTF-8 only after all bytes arrive and rejects malformed UTF-8', async () => {
    const server = new MobileServer({ list: () => [{ ...entry, id: '汉' }], rate: async id => ({ ...entry, id }) });
    servers.push(server);
    const status = await server.start('127.0.0.1'), url = new URL(status.urls[0]);
    const token = url.hash.slice(1);
    const bytes = Buffer.from('汉');
    const response = await sendChunks(url.origin, token, [Buffer.from('{"id":"'), bytes.subarray(0, 1), bytes.subarray(1), Buffer.from('","rating":"good"}')]);
    expect(response.status).toBe(200);
    expect(response.body.entry.id).toBe('汉');
    const invalid = await sendChunks(url.origin, token, [Buffer.from('{"id":"'), Buffer.from([0xc3, 0x28]), Buffer.from('","rating":"good"}')]);
    expect(invalid.status).toBe(400);
  });
  it('distinguishes a storage failure from a missing card without exposing local error details', async () => {
    const server = new MobileServer({ list: () => [entry], rate: async () => { throw new Error('C:\\private\\library.json is unavailable'); } });
    servers.push(server);
    const status = await server.start('127.0.0.1'), url = new URL(status.urls[0]);
    const headers = { authorization: 'Bearer ' + url.hash.slice(1), 'content-type': 'application/json' };
    const missing = await fetch(url.origin + '/api/review', { method: 'POST', headers, body: JSON.stringify({ id: 'missing', rating: 'good' }) });
    expect(missing.status).toBe(404);
    const failed = await fetch(url.origin + '/api/review', { method: 'POST', headers, body: JSON.stringify({ id: entry.id, rating: 'good' }) });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('private');
  });
  it('does not misreport a committed review when desktop notification fails', async () => {
    const server = new MobileServer({ list: () => [entry], rate: async () => entry }, () => { throw new Error('window is closed'); });
    servers.push(server);
    const status = await server.start('127.0.0.1'), url = new URL(status.urls[0]);
    const response = await fetch(url.origin + '/api/review', { method: 'POST', headers: { authorization: 'Bearer ' + url.hash.slice(1), 'content-type': 'application/json' }, body: JSON.stringify({ id: entry.id, rating: 'good' }) });
    expect(response.status).toBe(200);
  });
  it('persists a phone review through the actual LibraryStore and keeps provider credentials private', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingoleaf-mobile-')); directories.push(directory);
    const protect = (value: string) => Buffer.from(value).toString('base64');
    const unprotect = (value: string) => Buffer.from(value, 'base64').toString('utf8');
    const store = new LibraryStore(directory, protect, unprotect); await store.init();
    await store.saveSettings({ ...store.getSettings(), apiKey: 'secret-not-for-phone' });
    const { id: _id, createdAt: _created, updatedAt: _updated, review: _review, sourceLanguage: _source, targetLanguage: _target, ...analysis } = entry;
    const added = await store.add(analysis, store.getSettings());
    const server = new MobileServer(store); servers.push(server);
    const status = await server.start('127.0.0.1'), url = new URL(status.urls[0]);
    const headers = { authorization: 'Bearer ' + url.hash.slice(1), 'content-type': 'application/json' };
    const state = await fetch(url.origin + '/api/entries', { headers });
    const text = await state.text();
    expect(text).not.toContain('secret-not-for-phone');
    expect(text).not.toContain('apiKey');
    const response = await fetch(url.origin + '/api/review', { method: 'POST', headers, body: JSON.stringify({ id: added.id, rating: 'good' }) });
    expect(response.status).toBe(200);
    const reviewed = (await response.json()).entry;
    expect(reviewed.review.repetitions).toBe(1);
    const restarted = new LibraryStore(directory, protect, unprotect); await restarted.init();
    expect(restarted.list()[0].review).toEqual(reviewed.review);
    expect(await fs.readFile(path.join(store.getLibraryDirectory(), 'index.md'), 'utf8')).toContain(reviewed.review.dueAt.slice(0, 16).replace('T', ' '));
  });
  it('ships a syntactically valid client script (the HTML string is not compiled by TypeScript)', () => {
    const script = MOBILE_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Script(script!)).not.toThrow();
  });
});

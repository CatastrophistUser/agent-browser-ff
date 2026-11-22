import fs from 'node:fs';
import net from 'node:net';
import { z } from 'zod';
import { errors as pwErrors } from 'playwright-core';
import { FpError } from '../shared/errors.js';
import { paths, idleMs, DEFAULT_TIMEOUT } from '../shared/config.js';
import { methods, requestSchema, type RpcResponse } from '../shared/protocol.js';
import { Sessions } from './sessions.js';
import type { Ctx, Handler, Result } from './actions/common.js';
import * as nav from './actions/navigate.js';
import * as inter from './actions/interact.js';
import * as ex from './actions/extract.js';
import * as sess from './actions/sessions.js';
import * as mac from './actions/macros.js';
import { scrape } from './actions/scrape.js';
import { crawl } from './actions/crawl.js';
import { video, macroRecord, macroStop } from './actions/media.js';
import { vaultFill, login } from './actions/vault.js';

const started = Date.now();
export const sessions = new Sessions();
let shutdown: () => Promise<void> = async () => undefined;

const handlers: Record<keyof typeof methods, Handler> = {
  'open': nav.open, 'gui': nav.gui, 'close': nav.close, 'goto': nav.goto, 'back': nav.back, 'forward': nav.forward, 'reload': nav.reload,
  'follow': nav.follow, 'wait': nav.wait, 'paginate': nav.paginate, 'tabs': nav.tabs,
  'click': inter.click, 'hover': inter.hover, 'type': inter.type, 'fill': inter.fill, 'press': inter.press, 'check': inter.check,
  'select': inter.select, 'drag': inter.drag, 'upload': inter.upload, 'scroll': inter.scroll, 'form.fill': inter.formFill,
  'snapshot': ex.snapshot, 'text': ex.text, 'attr': ex.attr, 'html': ex.html, 'eval': ex.evalJs, 'screenshot': ex.screenshot, 'pdf': ex.pdf,
  'console': ex.consoleLog, 'network': ex.network, 'assert': ex.assertFn, 'state.save': ex.stateSave, 'state.load': ex.stateLoad,
  'scrape': scrape, 'crawl': crawl, 'video': video, 'vault.fill': vaultFill, 'login': login, 'macro.record': macroRecord, 'macro.stop': macroStop,
  'session.new': sess.sessionNew, 'session.list': sess.sessionList, 'session.close': sess.sessionClose,
  'macro.fromHistory': mac.macroFromHistory, 'macro.list': mac.macroList, 'macro.show': mac.macroShow, 'macro.delete': mac.macroDelete,
  'macro.begin': mac.macroBegin, 'macro.step': mac.macroStep,
  'daemon.status': async () => ({ message: `daemon running, pid ${process.pid}, up ${Math.round((Date.now() - started) / 1000)}s, ${sessions.map.size} session(s)`, pid: process.pid, sessions: [...sessions.map.keys()] }),
  'daemon.stop': async () => { setImmediate(() => void shutdown()); return { message: 'daemon stopping' }; },
};

function log(line: string) {
  try { fs.appendFileSync(paths.log(), `${new Date().toISOString()} ${line}\n`); } catch { /* ignore */ }
}

export function toFpError(e: unknown): FpError {
  if (e instanceof FpError) return e;
  if (e instanceof z.ZodError) return new FpError('E_BAD_ARGS', e.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; '), 'Check the command arguments (`agent-browser-ff <command> --help`).');
  if (e instanceof pwErrors.TimeoutError) return new FpError('E_TIMEOUT', e.message.split('\n')[0]!.slice(0, 200), 'Increase --timeout, or check that the element/page exists (run `agent-browser-ff snapshot`).');
  const msg = e instanceof Error ? e.message.split('\n')[0]! : String(e);
  if (/Target (page|closed)|has been closed|browser has been closed/i.test(msg)) return new FpError('E_NO_SESSION', msg.slice(0, 200), 'The page or browser closed. Run `agent-browser-ff open <url>` again.');
  return new FpError('E_GENERIC', msg.slice(0, 300));
}

async function dispatch(raw: string): Promise<RpcResponse> {
  let id: string | number | null = null;
  try {
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new FpError('E_BAD_ARGS', 'Malformed JSON request.'); }
    const req = requestSchema.parse(json); id = req.id;
    const schema = (methods as Record<string, z.ZodType>)[req.method];
    if (!schema) throw new FpError('E_BAD_ARGS', `Unknown method ${req.method}.`);
    const p = schema.parse(req.params) as Record<string, any>;
    const ctx: Ctx = {
      sessions, name: p.session ?? 'default', timeout: p.timeout ?? DEFAULT_TIMEOUT, cwd: p.cwd ?? process.cwd(), p,
      s: () => sessions.get(p.session ?? 'default'),
    };
    const result: Result = await handlers[req.method as keyof typeof methods](ctx);
    log(`${req.method} session=${ctx.name} ok`);
    return { jsonrpc: '2.0', id, result };
  } catch (e) {
    const err = toFpError(e);
    log(`error ${err.code}: ${err.message.replace(/(password|token|secret)=\S+/gi, '$1=REDACTED')}`);
    return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message, data: { code: err.code, hint: err.hint } } };
  }
}

function socketIsLive(sock: string): Promise<boolean> {
  return new Promise((resolve) => {
    const c = net.connect(sock);
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => resolve(false));
  });
}

export async function startServer(): Promise<void> {
  fs.mkdirSync(paths.run(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.logs(), { recursive: true, mode: 0o700 });
  const sock = paths.socket();
  // Concurrent first commands each spawn a daemon. An exclusive lockfile (atomic 'wx') elects exactly one;
  // the rest exit and the CLI connects to the winner. A lock left by a dead pid is taken over.
  const lock = sock + '.lock';
  const tryLock = (): boolean => {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); return true; } catch { return false; }
  };
  if (!tryLock()) {
    const owner = Number(fs.readFileSync(lock, 'utf8').trim());
    let alive = false;
    try { process.kill(owner, 0); alive = owner !== process.pid; } catch { /* dead */ }
    if (alive) { log(`daemon pid=${process.pid} exiting: daemon ${owner} holds the lock`); process.exit(0); }
    fs.rmSync(lock, { force: true });
    if (!tryLock()) { log(`daemon pid=${process.pid} exiting: lost lock race`); process.exit(0); }
  }
  process.on('exit', () => { try { if (fs.readFileSync(lock, 'utf8').trim() === String(process.pid)) fs.rmSync(lock, { force: true }); } catch { /* ignore */ } });
  // Defense in depth: never delete a socket something is still listening on.
  if (await socketIsLive(sock)) { log(`daemon pid=${process.pid} exiting: another daemon is already listening`); process.exit(0); }
  if (process.platform !== 'win32' && fs.existsSync(sock)) fs.rmSync(sock, { force: true });
  let idle: NodeJS.Timeout;
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => void shutdown(), idleMs()); };
  const queues = new Map<string, Promise<unknown>>();

  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        resetIdle();
        let key = 'default';
        try { key = (JSON.parse(line)?.params?.session as string) ?? 'default'; } catch { /* handled in dispatch */ }
        // serialize requests per session so page state is never raced
        const prev = queues.get(key) ?? Promise.resolve();
        const next = prev.then(() => dispatch(line)).then((res) => { if (!conn.destroyed) conn.write(JSON.stringify(res) + '\n'); });
        queues.set(key, next.catch(() => undefined));
      }
    });
    conn.on('error', () => undefined);
  });

  shutdown = async () => {
    clearTimeout(idle);
    log('daemon shutting down');
    await sessions.closeAll().catch(() => undefined);
    server.close();
    if (process.platform !== 'win32') fs.rmSync(sock, { force: true });
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(sock, resolve); });
  } catch (e) {
    // Lost a bind race with another daemon: yield to it rather than crash.
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE' && await socketIsLive(sock)) { log(`daemon pid=${process.pid} exiting: lost bind race`); process.exit(0); }
    throw e;
  }
  if (process.platform !== 'win32') fs.chmodSync(sock, 0o600);
  resetIdle();
  log(`daemon listening pid=${process.pid}`);
}

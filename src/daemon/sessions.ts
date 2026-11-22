import fs from 'node:fs';
import path from 'node:path';
import { firefox, devices, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { FpError } from '../shared/errors.js';
import { paths, DEFAULT_TIMEOUT } from '../shared/config.js';
import { redactUrl } from '../shared/redact.js';
import { RefRegistry, type Descriptor } from './refs.js';

export interface HistoryEntry {
  kind: string;
  target?: Descriptor;
  value?: string;
  values?: string[];
  secret?: boolean;
  url?: string;
  navigated?: boolean;
  [k: string]: unknown;
}
export interface ConsoleEntry { level: string; text: string; url: string }
export interface NetEntry { method: string; url: string; status?: number; type: string; ms?: number; start: number }

const OVERLAY_SCRIPT = `(() => {
  if (window.__fpOverlay) return;
  const host = document.createElement('div');
  host.setAttribute('data-fp-overlay', '');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;border:2px solid #ff7139;background:rgba(255,113,57,.12);display:none;pointer-events:none;';
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;right:8px;bottom:8px;font:12px monospace;background:#20123a;color:#fff;padding:4px 8px;border-radius:4px;pointer-events:none;';
  badge.textContent = 'agent-browser-ff';
  root.append(box, badge);
  const attach = () => document.documentElement.appendChild(host);
  if (document.documentElement) attach(); else document.addEventListener('DOMContentLoaded', attach);
  window.__fpOverlay = (label, r) => {
    badge.textContent = label;
    if (r) { Object.assign(box.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' }); }
    else box.style.display = 'none';
  };
})();`;

export class Session {
  pages: Page[] = [];
  cur = 0;
  refs = new RefRegistry();
  history: HistoryEntry[] = [];
  consoleLog: ConsoleEntry[] = [];
  net: NetEntry[] = [];
  gui = false;
  slowmo = 0;
  viewport: { width: number; height: number } = { width: 1280, height: 800 };
  device?: string;
  videoDir?: string;
  recording?: { name: string; events: HistoryEntry[]; lastActionAt: number };
  recorderBound = false;
  macroPlay?: { steps: unknown[]; vars: Record<string, string>; name: string };
  navCounter = 0;
  constructor(public name: string, public persistent: boolean, public context: BrowserContext, public browser?: Browser) {}

  get page(): Page {
    const p = this.pages[this.cur];
    if (!p || p.isClosed()) throw new FpError('E_NO_SESSION', 'No open page in this session.', 'Run `agent-browser-ff open <url>` first.');
    return p;
  }

  attach(page: Page) {
    this.pages.push(page);
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) { this.refs.invalidate(); this.navCounter++; } });
    page.on('console', (m) => {
      this.consoleLog.push({ level: m.type(), text: m.text().slice(0, 500), url: redactUrl(page.url()) });
      if (this.consoleLog.length > 1000) this.consoleLog.shift();
    });
    page.on('pageerror', (e) => this.consoleLog.push({ level: 'error', text: String(e.message).slice(0, 500), url: redactUrl(page.url()) }));
    page.on('requestfinished', async (req) => {
      let status: number | undefined;
      try { status = (await req.response())?.status(); } catch { /* ignore */ }
      const t = req.timing();
      this.net.push({ method: req.method(), url: redactUrl(req.url()), status, type: req.resourceType(), ms: t.responseEnd > 0 ? Math.round(t.responseEnd) : undefined, start: Date.now() });
      if (this.net.length > 2000) this.net.shift();
    });
    page.on('requestfailed', (req) => this.net.push({ method: req.method(), url: redactUrl(req.url()), status: 0, type: req.resourceType(), start: Date.now() }));
    page.on('close', () => {
      const i = this.pages.indexOf(page);
      if (i >= 0) { this.pages.splice(i, 1); if (this.cur >= this.pages.length) this.cur = Math.max(0, this.pages.length - 1); this.refs.invalidate(); }
    });
  }

  async highlight(label: string, locator?: import('playwright-core').Locator) {
    if (!this.gui) return;
    try {
      const box = locator ? await locator.first().boundingBox({ timeout: 1000 }) : null;
      await this.page.evaluate(([l, b]) => (window as any).__fpOverlay?.(l, b), [label, box] as const);
    } catch { /* overlay is best-effort */ }
  }
}

export class Sessions {
  private browsers = new Map<string, Browser>();
  map = new Map<string, Session>();

  has(name: string) { return this.map.has(name); }
  get(name: string): Session {
    const s = this.map.get(name);
    if (!s) throw new FpError('E_NO_SESSION', `No open session "${name}".`, 'Run `agent-browser-ff open <url>` (optionally with --session) first.');
    return s;
  }

  private async browserFor(gui: boolean, slowmo: number): Promise<Browser> {
    if (gui && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
      throw new FpError('E_NO_DISPLAY', 'No display available for --gui.', 'Run headless (omit --gui) or set DISPLAY/WAYLAND_DISPLAY.');
    const key = `${gui}:${slowmo}`;
    let b = this.browsers.get(key);
    if (!b || !b.isConnected()) {
      b = await firefox.launch({ headless: !gui, slowMo: slowmo });
      this.browsers.set(key, b);
    }
    return b;
  }

  async launch(name: string, o: { gui: boolean; slowmo: number; persistent: boolean; viewport?: string; device?: string; storageState?: any; recordVideo?: string }): Promise<Session> {
    let viewport = { width: 1280, height: 800 };
    if (o.viewport) { const [w, h] = o.viewport.split('x').map(Number); viewport = { width: w!, height: h! }; }
    let ctxOpts: Record<string, unknown> = { viewport, acceptDownloads: true };
    if (o.device) {
      const d = (devices as Record<string, any>)[o.device];
      if (!d) throw new FpError('E_BAD_ARGS', `Unknown device "${o.device}".`, 'Use a Playwright device name such as "iPhone 13".');
      const { defaultBrowserType: _ignore, ...rest } = d;
      ctxOpts = { ...rest, acceptDownloads: true };
      // Firefox does not support isMobile/hasTouch emulation
      delete ctxOpts.isMobile; delete ctxOpts.hasTouch;
      viewport = (rest as any).viewport ?? viewport;
    }
    if (o.recordVideo) ctxOpts.recordVideo = { dir: o.recordVideo, size: viewport };
    let context: BrowserContext; let browser: Browser | undefined;
    if (o.persistent) {
      if (o.gui && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
        throw new FpError('E_NO_DISPLAY', 'No display available for --gui.', 'Run headless (omit --gui).');
      const dir = path.join(paths.profiles(), name);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      context = await firefox.launchPersistentContext(dir, { headless: !o.gui, slowMo: o.slowmo, ...ctxOpts });
    } else {
      browser = await this.browserFor(o.gui, o.slowmo);
      context = await browser.newContext({ ...ctxOpts, storageState: o.storageState });
    }
    context.setDefaultTimeout(DEFAULT_TIMEOUT);
    if (o.gui) await context.addInitScript(OVERLAY_SCRIPT);
    const s = new Session(name, o.persistent, context, browser);
    s.gui = o.gui; s.slowmo = o.slowmo; s.viewport = viewport; s.device = o.device;
    for (const p of context.pages()) s.attach(p);
    context.on('page', (p) => s.attach(p));
    if (s.pages.length === 0) await context.newPage();
    this.map.set(name, s);
    return s;
  }

  /** Close and relaunch (optionally in the other mode), keeping cookies, localStorage and the URL. */
  async relaunch(name: string, o: { gui?: boolean; recordVideo?: string | null } = {}): Promise<Session> {
    const old = this.get(name);
    const url = old.pages[old.cur] && !old.pages[old.cur]!.isClosed() ? old.page.url() : undefined;
    const state = await old.context.storageState();
    const gui = o.gui ?? old.gui;
    const slowmo = o.gui === undefined ? old.slowmo : gui ? (old.slowmo || 250) : 0;
    const persistent = old.persistent;
    const videoDir = o.recordVideo === undefined ? old.videoDir : o.recordVideo ?? undefined;
    await this.close(name);
    const s = await this.launch(name, { gui, slowmo, persistent, device: old.device, viewport: `${old.viewport.width}x${old.viewport.height}`, storageState: persistent ? undefined : state, recordVideo: videoDir });
    s.videoDir = videoDir;
    if (persistent && state.cookies.length) await s.context.addCookies(state.cookies);
    if (url && url !== 'about:blank') await s.page.goto(url);
    return s;
  }
  switchMode(name: string, gui: boolean) { return this.relaunch(name, { gui }); }

  async close(name: string) {
    const s = this.map.get(name);
    if (!s) return;
    this.map.delete(name);
    await s.context.close().catch(() => undefined);
    if (s.browser && ![...this.map.values()].some((x) => x.browser === s.browser)) {
      await s.browser.close().catch(() => undefined);
      for (const [k, v] of this.browsers) if (v === s.browser) this.browsers.delete(k);
    }
  }

  async closeAll() { for (const n of [...this.map.keys()]) await this.close(n); }
}

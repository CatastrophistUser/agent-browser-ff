import fs from 'node:fs';
import { FpError } from '../../shared/errors.js';
import { redactUrl } from '../../shared/redact.js';
import { type Handler, abs, artifactPath, resolve, isRef } from './common.js';

export const snapshot: Handler = async (c) => {
  const s = c.s();
  // An action like click may have started a navigation that has not committed yet. Wait for the DOM,
  // then retry if a navigation landed while we were reading (the refs would be stale on arrival).
  let lines: string[] = [];
  for (let attempt = 1; ; attempt++) {
    await s.page.waitForLoadState('domcontentloaded', { timeout: c.timeout }).catch(() => undefined);
    const navAt = s.navCounter;
    try {
      lines = await s.refs.build(s.page, { full: !!c.p.full, selector: c.p.selector });
      if (s.navCounter === navAt) break;
    } catch (e) {
      if (e instanceof FpError || attempt >= 4) throw e;
    }
    if (attempt >= 4) break;
    await new Promise((r) => setTimeout(r, 100 * attempt));
  }
  const head = `# ${(await s.page.title()).slice(0, 80)} — ${redactUrl(s.page.url())} (gen ${s.refs.generation}, ${s.refs.entries.size} refs)`;
  return { message: [head, ...lines].join('\n'), refs: s.refs.entries.size, generation: s.refs.generation };
};

export const text: Handler = async (c) => {
  const r = await resolve(c, c.p.target);
  if (c.p.all) { const all = await r.loc.page().locator(c.p.target.startsWith('@') ? `[data-fp-ref]` : c.p.target).allInnerTexts(); return { message: all.join('\n'), items: all }; }
  const t = (await r.loc.innerText({ timeout: c.timeout })).trim();
  return { message: t, text: t };
};

export const attr: Handler = async (c) => {
  const r = await resolve(c, c.p.target);
  if (c.p.all && !isRef(c.p.target)) {
    const vals = await r.loc.page().locator(c.p.target).evaluateAll((els, n) => els.map((e) => e.getAttribute(n)), c.p.name);
    return { message: vals.map((v) => v ?? '').join('\n'), values: vals };
  }
  const v = await r.loc.getAttribute(c.p.name, { timeout: c.timeout });
  return { message: v ?? '(none)', value: v };
};

export const html: Handler = async (c) => {
  const r = await resolve(c, c.p.target);
  const h = await r.loc.evaluate((el, outer) => (outer ? el.outerHTML : el.innerHTML), !!c.p.outer);
  return { message: h, html: h };
};

export const evalJs: Handler = async (c) => {
  const s = c.s();
  const arg = c.p.arg === undefined ? 'undefined' : JSON.stringify(c.p.arg);
  let res: unknown;
  try { res = await s.page.evaluate(`((arg) => (${c.p.expression}))(${arg})`); }
  catch (e) {
    // not a single expression: run as statements (use `return` to produce a value)
    if (!/SyntaxError|missing|unexpected|expected/i.test((e as Error).message)) throw e;
    res = await s.page.evaluate(`((arg) => { ${c.p.expression} })(${arg})`);
  }
  const out = typeof res === 'string' ? res : JSON.stringify(res, null, 0) ?? 'undefined';
  return { message: out.length > 4000 ? out.slice(0, 4000) + `… (truncated, ${out.length} chars)` : out, value: res };
};

export const screenshot: Handler = async (c) => {
  const s = c.s();
  const file = artifactPath(c, `screenshot-${Date.now()}.png`, c.p.out);
  const style = c.p.withOverlay ? undefined : '[data-fp-overlay]{display:none !important}';
  if (c.p.target) { const r = await resolve(c, c.p.target); await r.loc.screenshot({ path: file, style, timeout: c.timeout }); }
  else await s.page.screenshot({ path: file, fullPage: !!c.p.fullPage, style, timeout: c.timeout });
  return { message: `screenshot saved: ${file}`, path: file };
};

export const pdf: Handler = async () => {
  throw new FpError('E_UNSUPPORTED', 'PDF export is not supported by Firefox in Playwright.', 'Use `agent-browser-ff screenshot --full-page` instead.');
};

export const consoleLog: Handler = async (c) => {
  const s = c.s(); const since = c.p.since ?? 0;
  const rows = s.consoleLog.slice(since).filter((e) => !c.p.level || e.level === c.p.level || (c.p.level === 'error' && e.level === 'pageerror'));
  return { message: rows.length ? rows.map((e) => `[${e.level}] ${e.text}`).join('\n') : '(no console messages)', count: s.consoleLog.length, entries: rows };
};

export const network: Handler = async (c) => {
  const s = c.s();
  const rows = s.net.filter((e) => !c.p.filter || e.url.includes(c.p.filter));
  if (c.p.har) {
    const file = artifactPath(c, 'network.har', c.p.har);
    const har = { log: { version: '1.2', creator: { name: 'agent-browser-ff', version: '0.1.0' }, entries: rows.map((e) => ({
      startedDateTime: new Date(e.start).toISOString(), time: e.ms ?? 0,
      request: { method: e.method, url: e.url, httpVersion: 'HTTP/1.1', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
      response: { status: e.status ?? 0, statusText: '', httpVersion: 'HTTP/1.1', headers: [], cookies: [], content: { size: -1, mimeType: e.type }, redirectURL: '', headersSize: -1, bodySize: -1 },
      cache: {}, timings: { send: 0, wait: e.ms ?? 0, receive: 0 } })) } };
    fs.writeFileSync(file, JSON.stringify(har, null, 2));
    return { message: `HAR saved: ${file} (${rows.length} entries)`, path: file };
  }
  const shown = rows.slice(-50);
  return { message: shown.length ? shown.map((e) => `${e.status ?? '-'} ${e.method} ${e.url}`).join('\n') + (rows.length > 50 ? `\n… ${rows.length - 50} earlier omitted` : '') : '(no requests)', count: rows.length };
};

export const assertFn: Handler = async (c) => {
  const s = c.s(); const { target, kind, expected } = c.p;
  const loc = isRef(target) ? (await resolve(c, target, { wait: false })).loc : s.page.locator(target).first();
  const deadline = Date.now() + Math.min(c.timeout, 3000);
  let actual = '';
  const check = async (): Promise<boolean> => {
    switch (kind) {
      case 'visible': actual = String(await loc.isVisible()); return actual === 'true';
      case 'hidden': actual = (await loc.count()) === 0 ? 'absent' : String(await loc.isVisible()); return actual === 'absent' || actual === 'false';
      case 'text': actual = (await loc.count()) ? (await loc.innerText()).trim() : '(absent)'; return actual.includes(expected ?? '');
      case 'value': actual = (await loc.count()) ? await loc.inputValue() : '(absent)'; return actual === expected;
      case 'count': { const n = isRef(target) ? await loc.count() : await s.page.locator(target).count(); actual = String(n); return n === Number(expected); }
    }
    return false;
  };
  if (['text', 'value', 'count'].includes(kind) && expected === undefined) throw new FpError('E_BAD_ARGS', `assert ${kind} needs an expected value.`);
  let ok = await check();
  while (!ok && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 100)); ok = await check(); }
  if (!ok) throw new FpError('E_ASSERT', `Assertion failed: ${target} ${kind}${expected !== undefined ? ` ${JSON.stringify(expected)}` : ''}; actual: ${JSON.stringify(actual.slice(0, 120))}`, 'Take a snapshot or screenshot to see the current page state.');
  return { message: `assert ok: ${target} ${kind}${expected !== undefined ? ` ${JSON.stringify(expected)}` : ''}` };
};

export const stateSave: Handler = async (c) => {
  const file = abs(c, c.p.file);
  await c.s().context.storageState({ path: file });
  fs.chmodSync(file, 0o600);
  return { message: `state saved: ${file} (WARNING: contains live cookies; do not commit or share)`, path: file };
};
export const stateLoad: Handler = async (c) => {
  const file = abs(c, c.p.file);
  if (!fs.existsSync(file)) throw new FpError('E_BAD_ARGS', `State file not found: ${file}`);
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old = c.s(); const url = old.page.url(); const persistent = old.persistent;
  if (persistent) { await old.context.addCookies(state.cookies ?? []); return { message: `cookies loaded into persistent session (localStorage not restored)` }; }
  const { gui, slowmo, device } = old; const vp = `${old.viewport.width}x${old.viewport.height}`;
  await c.sessions.close(c.name);
  const s = await c.sessions.launch(c.name, { gui, slowmo, persistent: false, viewport: vp, device, storageState: state });
  if (url && url !== 'about:blank') await s.page.goto(url);
  return { message: `state loaded from ${file}; reloaded ${redactUrl(url)}` };
};

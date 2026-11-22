import { FpError } from '../../shared/errors.js';
import { redactUrl } from '../../shared/redact.js';
import { type Handler, type Result, resolve, isRef } from './common.js';

const where = async (c: any): Promise<string> => `${redactUrl(c.s().page.url())} "${(await c.s().page.title()).slice(0, 60)}"`;

export const open: Handler = async (c) => {
  const p = c.p;
  const gui: boolean = !!p.gui;
  let s;
  if (c.sessions.has(c.name)) {
    s = c.sessions.get(c.name);
    if (p.gui !== undefined && p.gui !== s.gui) s = await c.sessions.switchMode(c.name, gui);
  } else {
    s = await c.sessions.launch(c.name, { gui, slowmo: p.slowmo ?? (gui ? 250 : 0), persistent: !!p.persistent, viewport: p.viewport, device: p.device });
  }
  if (p.url) {
    await s.page.goto(p.url, { timeout: c.timeout });
    s.history.push({ kind: 'goto', url: p.url });
  }
  return { message: `opened ${p.url ? await where(c) : 'blank page'}${s.gui ? ' [gui]' : ''}` };
};

export const gui: Handler = async (c) => {
  if (!c.sessions.has(c.name)) throw new FpError('E_NO_SESSION', `No open session "${c.name}".`, 'Run `agent-browser-ff open` first.');
  const s = await c.sessions.switchMode(c.name, !!c.p.on);
  return { message: `gui ${c.p.on ? 'on' : 'off'}, session preserved at ${redactUrl(s.page.url())}` };
};

export const close: Handler = async (c) => {
  await c.sessions.close(c.name);
  return { message: `closed session ${c.name}` };
};

export const goto: Handler = async (c) => {
  const s = c.s();
  await s.page.goto(c.p.url, { timeout: c.timeout });
  s.history.push({ kind: 'goto', url: c.p.url });
  return { message: `goto ${await where(c)}` };
};

const hist = (name: 'back' | 'forward' | 'reload'): Handler => async (c) => {
  const s = c.s();
  const fn = { back: () => s.page.goBack({ timeout: c.timeout }), forward: () => s.page.goForward({ timeout: c.timeout }), reload: () => s.page.reload({ timeout: c.timeout }) }[name];
  await fn();
  s.history.push({ kind: name });
  return { message: `${name} ${await where(c)}` };
};
export const back = hist('back'), forward = hist('forward'), reload = hist('reload');

export const follow: Handler = async (c) => {
  const s = c.s();
  const r = await resolve(c, c.p.target);
  await s.highlight(`follow ${r.label}`, r.loc);
  await r.loc.click({ timeout: c.timeout });
  await s.page.waitForLoadState('load', { timeout: c.timeout });
  s.history.push({ kind: 'click', target: r.desc, navigated: true });
  return { message: `followed ${r.label} → ${await where(c)}` };
};

export const wait: Handler = async (c) => {
  const s = c.s(); const { kind, value, state } = c.p;
  const need = () => { if (!value) throw new FpError('E_BAD_ARGS', `wait ${kind} needs a value.`, `Usage: agent-browser-ff wait ${kind} <value>`); return value as string; };
  switch (kind) {
    case 'load': case 'domcontentloaded': case 'networkidle':
      await s.page.waitForLoadState(kind, { timeout: c.timeout }); s.history.push({ kind: 'wait', value: kind }); return { message: `waited for ${kind}` };
    case 'selector': {
      const t = need(); const st = state ?? 'visible';
      const loc = isRef(t) ? (await resolve(c, t)).loc : s.page.locator(t).first();
      await loc.waitFor({ state: st, timeout: c.timeout });
      return { message: `${t} is ${st}` };
    }
    case 'text': {
      const t = need();
      await s.page.waitForFunction((x) => document.body?.innerText.includes(x), t, { timeout: c.timeout });
      return { message: `text found: ${JSON.stringify(t.slice(0, 40))}` };
    }
    case 'url': await s.page.waitForURL(need(), { timeout: c.timeout }); return { message: `url matches ${value}` };
    case 'ms': { const n = Number(need()); if (!Number.isFinite(n) || n < 0) throw new FpError('E_BAD_ARGS', 'wait ms needs a non-negative number.'); await new Promise((r) => setTimeout(r, n)); return { message: `waited ${n}ms` }; }
  }
  throw new FpError('E_BAD_ARGS', `Unknown wait kind ${kind}.`);
};

export const paginate: Handler = async (c) => {
  const s = c.s(); const max = c.p.maxPages ?? (c.p.untilMissing ? 100 : 1);
  let pages = 0;
  while (pages < max) {
    const loc = s.page.locator(c.p.next).first();
    if ((await loc.count()) === 0 || !(await loc.isEnabled().catch(() => false)) || !(await loc.isVisible().catch(() => false))) break;
    await loc.click({ timeout: c.timeout });
    await s.page.waitForLoadState('load', { timeout: c.timeout }).catch(() => undefined);
    pages++;
  }
  s.history.push({ kind: 'paginate', value: c.p.next });
  return { message: `advanced ${pages} page(s), now at ${redactUrl(s.page.url())}`, pages };
};

export const tabs: Handler = async (c) => {
  const s = c.s(); const { action, url, id } = c.p;
  if (action === 'new') {
    const pg = await s.context.newPage();
    s.cur = s.pages.indexOf(pg);
    if (url) await pg.goto(url, { timeout: c.timeout });
    return { message: `tab ${s.cur} opened` };
  }
  if (action === 'switch' || action === 'close') {
    const pg = s.pages[id];
    if (id === undefined || !pg) throw new FpError('E_BAD_ARGS', `No tab ${id}.`, 'Run `agent-browser-ff tabs list` for ids.');
    if (action === 'switch') { s.cur = id; s.refs.invalidate(); return { message: `switched to tab ${id}` }; }
    await pg.close(); return { message: `closed tab ${id}` };
  }
  const lines = await Promise.all(s.pages.map(async (pg, i) => `${i === s.cur ? '*' : ' '} ${i} ${redactUrl(pg.url())} "${(await pg.title().catch(() => '')).slice(0, 50)}"`));
  return { message: lines.join('\n'), tabs: s.pages.length };
};

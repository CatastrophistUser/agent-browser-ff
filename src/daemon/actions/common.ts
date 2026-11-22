import path from 'node:path';
import fs from 'node:fs';
import type { Locator } from 'playwright-core';
import { FpError } from '../../shared/errors.js';
import type { Sessions, Session, HistoryEntry } from '../sessions.js';
import type { Descriptor } from '../refs.js';

export interface Result { message: string; [k: string]: unknown }
export interface Ctx {
  sessions: Sessions;
  name: string;
  timeout: number;
  cwd: string;
  p: any;
  /** The session, throwing E_NO_SESSION if absent. */
  s(): Session;
}
export type Handler = (c: Ctx) => Promise<Result>;

export const abs = (c: Ctx, f: string) => path.resolve(c.cwd, f);
export function artifactPath(c: Ctx, name: string, out?: string) {
  const file = out ? abs(c, out) : path.join(c.cwd, '.agent-browser-ff', 'artifacts', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}
export const isRef = (t: string) => /^@e\d+$/.test(t);
export const isSelector = (t: string) => /^(css|text|role|xpath)=/.test(t);

export function descFromSelector(t: string): Descriptor {
  const base = { role: '', name: '', tag: '', css: '' };
  if (t.startsWith('css=')) return { ...base, css: t.slice(4) };
  if (t.startsWith('text=')) return { ...base, text: t.slice(5), css: '' };
  const m = /^role=(\w+)(?:\[name=(?:"([^"]*)"|'([^']*)'|([^\]]*))\])?/.exec(t);
  if (m) return { ...base, role: m[1]!, name: m[2] ?? m[3] ?? m[4] ?? '' };
  return { ...base, css: t.replace(/^xpath=/, '') };
}

export interface Resolved { loc: Locator; label: string; desc: Descriptor }

/** Resolve a ref or prefixed selector to a locator, failing with typed errors. */
export async function resolve(c: Ctx, target: string, opts: { wait?: boolean } = {}): Promise<Resolved> {
  const s = c.s();
  if (isRef(target)) {
    const entry = s.refs.get(target);
    const loc = s.refs.locator(target);
    if ((await loc.count()) === 0)
      throw new FpError('E_STALE_REF', `Ref ${target} no longer exists in the page.`, 'The DOM changed. Run `agent-browser-ff snapshot` and use the new refs.');
    return { loc, label: `${target} ${JSON.stringify(entry.desc.name.slice(0, 40))}`, desc: entry.desc };
  }
  if (!isSelector(target))
    throw new FpError('E_BAD_ARGS', `Invalid target "${target}".`, 'Use a ref like @e3, or a selector prefixed with css=, text=, role= or xpath=.');
  const loc = s.page.locator(target).first();
  if (opts.wait !== false) {
    try { await loc.waitFor({ state: 'attached', timeout: c.timeout }); }
    catch { throw new FpError('E_NOT_FOUND', `No element matches ${target}.`, 'Check the selector, or wait for the content first (`agent-browser-ff wait selector ...`).'); }
  }
  return { loc, label: target, desc: descFromSelector(target) };
}

/** Run an action on a target: highlight in GUI mode, record history, report concisely. */
export async function act(c: Ctx, verb: string, target: string, kind: string, fn: (loc: Locator) => Promise<unknown>, extra: Partial<HistoryEntry> = {}, suffix = ''): Promise<Result> {
  const s = c.s();
  const r = await resolve(c, target);
  await s.highlight(`${verb} ${r.label}`, r.loc);
  const nav = s.navCounter;
  await fn(r.loc);
  s.history.push({ kind, target: r.desc, navigated: s.navCounter !== nav, ...extra });
  return { message: `${verb} ${r.label}${suffix}` };
}

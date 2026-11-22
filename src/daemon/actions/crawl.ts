import { FpError } from '../../shared/errors.js';
import { type Handler } from './common.js';
import { scrapeSchema, extractInPage } from '../scrape/schema.js';
import { emitItems } from './scrape.js';

export function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '.').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`);
}

export function parseRobots(txt: string): string[] {
  const disallow: string[] = []; let applies = false;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim(); const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1]!.toLowerCase();
    if (k === 'user-agent') applies = m[2]!.trim() === '*';
    else if (k === 'disallow' && applies && m[2]!.trim()) disallow.push(m[2]!.trim());
  }
  return disallow;
}

const norm = (u: string) => { try { const x = new URL(u); x.hash = ''; return x.toString(); } catch { return u; } };

export const crawl: Handler = async (c) => {
  const s = c.s();
  const parsed = scrapeSchema.safeParse(c.p.schema);
  if (!parsed.success) throw new FpError('E_BAD_ARGS', `Invalid schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const schema = parsed.data;
  const match = globToRegex(c.p.match);
  const maxPages: number = c.p.maxPages ?? 20;
  const delay: number = c.p.delay ?? 1000;
  const conc: number = Math.max(1, c.p.concurrency ?? 2);
  const start = norm(c.p.url);
  const warnings: string[] = [];
  if (c.p.ignoreRobots) warnings.push('warning: --ignore-robots set; robots.txt is not being respected');
  const robots = new Map<string, string[]>();
  const allowed = async (u: string) => {
    if (c.p.ignoreRobots) return true;
    const x = new URL(u);
    if (!robots.has(x.origin)) {
      try { const r = await fetch(`${x.origin}/robots.txt`, { signal: AbortSignal.timeout(5000) }); robots.set(x.origin, r.ok ? parseRobots(await r.text()) : []); }
      catch { robots.set(x.origin, []); }
    }
    return !robots.get(x.origin)!.some((d) => x.pathname.startsWith(d));
  };
  const queue: string[] = [start]; const seen = new Set<string>([start]);
  const items: Record<string, unknown>[] = []; const dedupe = new Set<string>();
  let visited = 0, skippedRobots = 0;
  const lastHit = new Map<string, number>();
  let gate: Promise<unknown> = Promise.resolve();
  const politely = (host: string) => { // serialize delay accounting per call, enforce min gap per host
    const p = gate.then(async () => { const wait = (lastHit.get(host) ?? 0) + delay - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastHit.set(host, Date.now()); });
    gate = p.catch(() => undefined); return p;
  };
  const pages = await Promise.all(Array.from({ length: conc }, () => s.context.newPage()));
  let active = 0;
  const worker = async (pg: (typeof pages)[number]) => {
    for (;;) {
      if (visited >= maxPages) return;
      const url = queue.shift();
      if (!url) { if (active === 0) return; await new Promise((r) => setTimeout(r, 50)); continue; }
      if (!(await allowed(url))) { skippedRobots++; continue; }
      if (visited >= maxPages) return;
      visited++; active++;
      try {
        await politely(new URL(url).host);
        await pg.goto(url, { timeout: c.timeout });
        for (const it of await pg.evaluate(extractInPage, schema)) {
          if (schema.dedupe) { const k = JSON.stringify(it[schema.dedupe]); if (dedupe.has(k)) continue; dedupe.add(k); }
          items.push({ ...it, _url: pg.url() });
        }
        const links = await pg.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href));
        for (const l of links) { const n = norm(l); if (!seen.has(n) && match.test(n)) { seen.add(n); queue.push(n); } }
      } catch { /* skip unreachable pages */ }
      finally { active--; }
    }
  };
  try { await Promise.all(pages.map(worker)); } finally { await Promise.all(pages.map((p) => p.close().catch(() => undefined))); }
  s.refs.invalidate();
  const res = emitItems(c, items, visited);
  const extra = [`crawled ${visited} page(s)${skippedRobots ? `, ${skippedRobots} skipped by robots.txt` : ''}`, ...warnings].join('; ');
  return { ...res, message: `${res.message}\n# ${extra}`, visited, skippedRobots };
};

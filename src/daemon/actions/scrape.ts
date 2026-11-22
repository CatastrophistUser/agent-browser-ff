import fs from 'node:fs';
import path from 'node:path';
import { FpError } from '../../shared/errors.js';
import { type Handler, type Ctx, type Result, abs } from './common.js';
import { scrapeSchema, extractInPage } from '../scrape/schema.js';

export function toCsv(rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const q = (v: unknown) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n') + '\n';
}

export const scrape: Handler = async (c) => {
  const s = c.s();
  const parsed = scrapeSchema.safeParse(c.p.schema);
  if (!parsed.success) throw new FpError('E_BAD_ARGS', `Invalid scrape schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'Fix the schema and retry.');
  const schema = parsed.data;
  const items: Record<string, unknown>[] = []; const seen = new Set<string>();
  let pages = 0; const max = c.p.maxPages ?? 1;
  for (;;) {
    pages++;
    const got = await s.page.evaluate(extractInPage, schema);
    for (const it of got) {
      if (schema.dedupe) { const k = JSON.stringify(it[schema.dedupe]); if (seen.has(k)) continue; seen.add(k); }
      items.push(it);
    }
    if (!c.p.paginateNext || pages >= max) break;
    const next = s.page.locator(c.p.paginateNext).first();
    if ((await next.count()) === 0 || !(await next.isVisible().catch(() => false)) || !(await next.isEnabled().catch(() => false))) break;
    const before = s.page.url();
    await next.click({ timeout: c.timeout });
    await s.page.waitForLoadState('load', { timeout: c.timeout }).catch(() => undefined);
    await s.page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => undefined);
    if (s.page.url() === before && got.length && JSON.stringify(await s.page.evaluate(extractInPage, schema)) === JSON.stringify(got)) break;
  }
  s.history.push({ kind: 'scrape' });
  return emitItems(c, items, pages);
};

/** Write items to --out, or print at most 50 and say how many were omitted. */
export function emitItems(c: Ctx, items: Record<string, unknown>[], pages: number): Result {
  if (c.p.out) {
    const file = abs(c, c.p.out);
    const body = c.p.format === 'csv' ? toCsv(items) : c.p.format === 'jsonl' ? items.map((i) => JSON.stringify(i)).join('\n') + '\n' : JSON.stringify(items, null, 2);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
    return { message: `scraped ${items.length} item(s) from ${pages} page(s) → ${file}`, path: file, count: items.length };
  }
  const shown = items.slice(0, 50);
  const omitted = items.length - shown.length;
  const body = c.p.format === 'csv' ? toCsv(shown) : c.p.format === 'jsonl' ? shown.map((i) => JSON.stringify(i)).join('\n') : JSON.stringify(shown, null, 2);
  return { message: `${body}\n# ${items.length} item(s) from ${pages} page(s)${omitted > 0 ? `; ${omitted} omitted, use --out for all` : ''}`, count: items.length, items: shown, omitted };
}

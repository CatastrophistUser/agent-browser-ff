import { z } from 'zod';

export interface FieldDef { selector?: string; extract?: string; item?: string; fields?: Record<string, FieldDef> }
const extract = z.string().refine((e) => e === 'text' || e === 'html' || /^attr:[\w:-]+$/.test(e) || /^js:.+/.test(e), { message: 'extract must be text, html, attr:<name> or js:<expression>' });
const field: z.ZodType<FieldDef> = z.lazy(() => z.object({
  selector: z.string().optional(), extract: extract.optional(), item: z.string().optional(), fields: z.record(z.string(), field).optional(),
}).refine((f) => (f.item ? !!f.fields : !!f.extract), { message: 'a field needs `extract`, or `item` + `fields` for a nested list' }));
export const scrapeSchema = z.object({ item: z.string().min(1), dedupe: z.string().optional(), fields: z.record(z.string(), field) });
export type ScrapeSchema = z.infer<typeof scrapeSchema>;

/** Runs in the page: extract all items described by the schema. */
export function extractInPage(schema: ScrapeSchema): Record<string, unknown>[] {
  const css = (s: string) => s.replace(/^css=/, '');
  const one = (root: Element, def: FieldDef): unknown => {
    if (def.item) return [...root.querySelectorAll(css(def.item))].map((el) => rec(el, def.fields!));
    const el = def.selector ? root.querySelector(css(def.selector)) : root;
    if (!el) return null;
    const e = def.extract!;
    if (e === 'text') return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (e === 'html') return el.innerHTML;
    if (e.startsWith('attr:')) return el.getAttribute(e.slice(5));
    if (e.startsWith('js:')) return new Function('el', `return (${e.slice(3)})`)(el);
    return null;
  };
  const rec = (el: Element, fields: Record<string, FieldDef>) => {
    const o: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(fields)) o[k] = one(el, d);
    return o;
  };
  return [...document.querySelectorAll(css(schema.item))].map((el) => rec(el, schema.fields));
}

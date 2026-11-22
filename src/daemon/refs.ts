import type { Frame, Locator, Page } from 'playwright-core';
import { FpError } from '../shared/errors.js';

export interface Descriptor {
  role: string;
  name: string;
  tag: string;
  level?: number;
  testid?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  css: string;
  inputType?: string;
  nth?: number;
}
interface RawEntry {
  depth: number; role: string; name: string; ref?: string; attrs: string;
  desc?: Omit<Descriptor, 'nth'>;
}
export interface RefEntry { frame: Frame; id: string; desc: Descriptor }

/** Runs inside the page. Must be fully self-contained (serialized by Playwright). */
export function snapshotInPage(opts: { selector?: string; full: boolean; start: number; prefix: string }) {
  const out: RawEntry[] = [];
  let n = opts.start;
  document.querySelectorAll('[data-fp-ref]').forEach((e) => e.removeAttribute('data-fp-ref'));
  const clip = (s: string, m = 80) => (s.length > m ? s.slice(0, m - 1) + '…' : s);
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const INTERACTIVE = new Set(['link', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox',
    'spinbutton', 'slider', 'file', 'tab', 'menuitem', 'switch', 'option', 'date']);
  const STRUCT = new Set(['list', 'table', 'row', 'form', 'navigation', 'main', 'iframe', 'banner', 'contentinfo', 'region']);

  function roleOf(el: Element): string {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0]!;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (t === 'hidden') return 'hidden';
      if (['submit', 'button', 'reset', 'image'].includes(t)) return 'button';
      if (t === 'checkbox' || t === 'radio') return t;
      if (t === 'search') return 'searchbox';
      if (t === 'number') return 'spinbutton';
      if (t === 'range') return 'slider';
      if (t === 'file') return 'file';
      if (['date', 'datetime-local', 'month', 'week', 'time'].includes(t)) return 'date';
      return 'textbox';
    }
    if (/^h[1-6]$/.test(tag)) return 'heading';
    const map: Record<string, string> = { img: 'img', ul: 'list', ol: 'list', li: 'listitem', table: 'table', tr: 'row',
      td: 'cell', th: 'columnheader', nav: 'navigation', main: 'main', form: 'form', iframe: 'iframe', header: 'banner',
      footer: 'contentinfo', section: 'region', p: 'paragraph' };
    return map[tag] ?? 'generic';
  }
  function isHidden(el: Element): boolean {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    return false;
  }
  function ownText(el: Element): string {
    let t = '';
    el.childNodes.forEach((c) => { if (c.nodeType === 3) t += c.textContent + ' '; });
    return norm(t);
  }
  function nameOf(el: Element, role: string): string {
    const aria = el.getAttribute('aria-label');
    if (aria) return norm(aria);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' '); if (norm(t)) return norm(t); }
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) { const t = norm(labels[0]!.textContent); if (t) return t; }
    if (role === 'button' && el.tagName === 'INPUT') return norm((el as HTMLInputElement).value) || norm(el.getAttribute('title'));
    const ph = el.getAttribute('placeholder'); if (ph) return norm(ph);
    const alt = el.getAttribute('alt'); if (alt) return norm(alt);
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'file') {
      const nm = el.getAttribute('name'); if (nm) return norm(nm);
    }
    const title = el.getAttribute('title');
    const text = norm(el.textContent);
    return text || norm(title);
  }
  function cssPath(el: Element): string {
    if ((el as HTMLElement).id && document.querySelectorAll('#' + CSS.escape((el as HTMLElement).id)).length === 1) return '#' + CSS.escape((el as HTMLElement).id);
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
      const tag = cur.tagName.toLowerCase();
      const parent: Element | null = cur.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      const same = [...parent.children].filter((c) => c.tagName === cur!.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
      cur = parent;
    }
    return parts.join(' > ');
  }
  function describe(el: Element, role: string, name: string): Omit<Descriptor, 'nth'> {
    const tag = el.tagName.toLowerCase();
    const lbl = (el as HTMLInputElement).labels?.[0]?.textContent;
    return {
      role, name, tag, css: cssPath(el),
      level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined,
      testid: el.getAttribute('data-testid') ?? undefined,
      label: lbl ? norm(lbl) : undefined,
      placeholder: el.getAttribute('placeholder') ?? undefined,
      text: norm(el.textContent).slice(0, 60) || undefined,
      inputType: tag === 'input' ? ((el as HTMLInputElement).type || 'text') : undefined,
    };
  }

  function walk(node: Element, depth: number, inInteractive: boolean) {
    if (node.hasAttribute('data-fp-overlay') || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD'].includes(node.tagName)) return;
    if (isHidden(node)) return;
    const role = roleOf(node);
    if (role === 'hidden') return;
    const tag = node.tagName.toLowerCase();
    const interactive = INTERACTIVE.has(role) || node.hasAttribute('onclick') || (node as HTMLElement).draggable === true
      || (node.hasAttribute('tabindex') && node.getAttribute('tabindex') !== '-1') || (node as HTMLElement).isContentEditable && node.getAttribute('contenteditable') !== null;
    let emitted = false;
    const text = ownText(node);
    const attrs: string[] = [];
    if (interactive) {
      const eff = role === 'generic' ? ((node as HTMLElement).draggable ? 'draggable' : 'clickable') : role;
      const name = nameOf(node, eff);
      const id = opts.prefix + (++n);
      node.setAttribute('data-fp-ref', id);
      if (role === 'link' && node.getAttribute('href')) attrs.push('href=' + clip(node.getAttribute('href')!, 60));
      if (role === 'checkbox' || role === 'radio' || role === 'switch') attrs.push((node as HTMLInputElement).checked ? '[checked]' : '[unchecked]');
      if ((node as HTMLInputElement).disabled) attrs.push('[disabled]');
      if (['textbox', 'searchbox', 'spinbutton', 'slider', 'date'].includes(role)) {
        const v = (node as HTMLInputElement).value; if (v && (node as HTMLInputElement).type !== 'password') attrs.push('value=' + JSON.stringify(clip(v, 40)));
        if ((node as HTMLInputElement).type === 'password' && v) attrs.push('value=••••');
      }
      if (role === 'combobox' || role === 'listbox') {
        const sel = node as HTMLSelectElement;
        attrs.push('value=' + JSON.stringify(clip([...sel.selectedOptions].map((o) => norm(o.textContent)).join(','), 40)));
        attrs.push('options=' + clip([...sel.options].map((o) => norm(o.textContent)).join('|'), 80));
      }
      out.push({ depth, role: eff, name: clip(name), ref: id, attrs: attrs.join(' '), desc: describe(node, eff, name) });
      emitted = true;
    } else if (role === 'heading') {
      out.push({ depth, role, name: clip(norm(node.textContent)), attrs: `[level=${tag[1]}]` });
      emitted = true;
    } else if (role === 'img') {
      const alt = node.getAttribute('alt'); if (alt) { out.push({ depth, role, name: clip(norm(alt)), attrs: '' }); emitted = true; }
    } else if (!inInteractive && text && !STRUCT.has(role) && tag !== 'label') {
      const id = opts.prefix + (++n);
      node.setAttribute('data-fp-ref', id);
      out.push({ depth, role: 'text', name: clip(text), ref: id, attrs: '', desc: describe(node, 'text', text) });
      emitted = true;
    } else if (STRUCT.has(role) || (opts.full && role !== 'generic') || (opts.full && !inInteractive)) {
      out.push({ depth, role: STRUCT.has(role) ? role : role === 'generic' ? tag : role, name: '', attrs: '' });
      emitted = true;
    }
    if (role === 'iframe' || role === 'combobox' || role === 'listbox' || role === 'heading') return;
    const d = emitted ? depth + 1 : depth;
    const kidsInteractive = inInteractive || (interactive && role !== 'generic' && !['form', 'table', 'list', 'row'].includes(role));
    if ((node as HTMLElement).shadowRoot) for (const c of (node as HTMLElement).shadowRoot!.children) walk(c, d, kidsInteractive);
    for (const c of node.children) walk(c, d, kidsInteractive);
  }

  const rootSel = opts.selector?.replace(/^css=/, '');
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  if (!root) return { error: 'selector matched nothing', out: [], count: 0 };
  walk(root, 0, false);
  return { out, count: n - opts.start, title: document.title };
}

export class RefRegistry {
  entries = new Map<string, RefEntry>();
  valid = false;
  generation = 0;

  invalidate() { this.valid = false; }

  async build(page: Page, opts: { full: boolean; selector?: string }): Promise<string[]> {
    this.generation++;
    this.entries.clear();
    const lines: string[] = [];
    const seen = new Map<string, number>();
    let counter = 0;
    const frames = page.frames();
    for (const frame of frames) {
      const isMain = frame === page.mainFrame();
      if (!isMain && frame.parentFrame() === null) continue;
      let res: Awaited<ReturnType<typeof runSnap>>;
      try { res = await runSnap(frame, { full: opts.full, selector: isMain ? opts.selector : undefined, start: counter, prefix: 'e' }); }
      catch (e) {
        // A subframe can vanish mid-snapshot; skip it. A main-frame failure (e.g. "Execution context was destroyed"
        // during navigation) must surface so the caller can retry, never yield an empty-but-valid snapshot.
        if (isMain) throw e;
        continue;
      }
      if ('error' in res && res.error) { if (isMain) throw new FpError('E_NOT_FOUND', `Snapshot selector matched nothing: ${opts.selector}`, 'Check the selector or run snapshot without --selector.'); continue; }
      if (!isMain) { if (opts.selector) continue; lines.push(`frame "${frame.url().slice(0, 80)}"`); }
      const base = isMain ? 0 : 1;
      for (const e of res.out) {
        let desc: Descriptor | undefined;
        if (e.ref && e.desc) {
          const key = `${e.desc.role}|${e.desc.name}`;
          const idx = seen.get(key) ?? 0;
          seen.set(key, idx + 1);
          desc = { ...e.desc, nth: idx };
          this.entries.set('@' + e.ref, { frame, id: e.ref, desc });
        }
        const pad = '  '.repeat(e.depth + base);
        const nm = e.name ? ` ${JSON.stringify(e.name)}` : '';
        lines.push(`${pad}${e.ref ? '@' + e.ref + ' ' : ''}${e.role}${nm}${e.attrs ? ' ' + e.attrs : ''}`);
      }
      counter += res.count;
    }
    // nth only matters when role+name is duplicated; strip otherwise
    const totals = new Map<string, number>();
    for (const e of this.entries.values()) { const k = `${e.desc.role}|${e.desc.name}`; totals.set(k, (totals.get(k) ?? 0) + 1); }
    for (const e of this.entries.values()) if ((totals.get(`${e.desc.role}|${e.desc.name}`) ?? 0) < 2) delete e.desc.nth;
    this.valid = true;
    return lines;
  }

  get(ref: string): RefEntry {
    if (!this.valid) throw new FpError('E_STALE_REF', `Ref ${ref} is stale: the page changed since the last snapshot.`, 'Run `agent-browser-ff snapshot` and use the new refs.');
    const e = this.entries.get(ref);
    if (!e) throw new FpError('E_STALE_REF', `Unknown ref ${ref}.`, 'Run `agent-browser-ff snapshot` and use refs from its output.');
    return e;
  }

  locator(ref: string): Locator {
    const e = this.get(ref);
    return e.frame.locator(`[data-fp-ref="${e.id}"]`);
  }
}

function runSnap(frame: Frame, o: { full: boolean; selector?: string; start: number; prefix: string }) {
  return frame.evaluate(snapshotInPage, o) as Promise<{ out: RawEntry[]; count: number; title?: string; error?: string }>;
}

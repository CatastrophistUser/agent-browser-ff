import type { Descriptor } from '../refs.js';
import type { HistoryEntry } from '../sessions.js';
import type { Macro, Step, Target } from './schema.js';

/** Primary locator by priority: role+name, testid, label/placeholder, text, css. */
export function primaryTarget(d: Descriptor): { target: Target; fallback?: Target } {
  const css = d.css ? { css: d.css } : undefined;
  let target: Target | undefined;
  if (d.role && d.name && d.role !== 'text' && d.role !== 'clickable' && d.role !== 'draggable') {
    target = { role: d.role, name: d.name, ...(d.level ? { level: d.level } : {}), ...(d.nth !== undefined ? { nth: d.nth } : {}) };
  } else if (d.testid) target = { testid: d.testid };
  else if (d.label) target = { label: d.label };
  else if (d.placeholder) target = { placeholder: d.placeholder };
  else if (d.text) target = { text: d.text };
  else if (css) return { target: css };
  if (!target) return { target: { css: 'body' } };
  return css && css.css ? { target, fallback: css } : { target };
}

function nameSlug(d?: Descriptor) { return (d?.name || d?.label || d?.placeholder || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'; }

export function sameTarget(a?: Descriptor, b?: Descriptor) { return !!a && !!b && a.css === b.css && a.role === b.role && a.name === b.name; }

export interface FromHistory { macro: Macro; warnings: string[] }

/** Convert recorded CLI history into a macro, applying the normalization rules. */
export function fromHistory(name: string, history: HistoryEntry[]): FromHistory {
  const warnings: string[] = [];
  const vars: Macro['vars'] = {};
  const steps: Step[] = [];
  // 1. collapse: merge consecutive type/fill on the same target; drop a click immediately followed by fill/type on the same target
  const merged: HistoryEntry[] = [];
  for (const e of history) {
    const last = merged[merged.length - 1];
    if ((e.kind === 'type' || e.kind === 'fill') && last && (last.kind === 'type' || last.kind === 'fill') && sameTarget(last.target, e.target)) {
      merged[merged.length - 1] = { ...e, kind: 'fill', value: e.kind === 'type' && last.kind === 'type' ? (last.value ?? '') + (e.value ?? '') : e.value, secret: last.secret || e.secret };
      continue;
    }
    if ((e.kind === 'type' || e.kind === 'fill') && last?.kind === 'click' && sameTarget(last.target, e.target)) merged.pop();
    merged.push(e);
  }
  const addStep = (s: Step) => steps.push(s);
  for (const e of merged) {
    const t = e.target ? primaryTarget(e.target) : undefined;
    switch (e.kind) {
      case 'goto': addStep({ goto: e.url as string }); addStep({ wait: 'load' }); break;
      case 'back': case 'forward': case 'reload': case 'scrape': case 'paginate': break;
      case 'click': addStep({ click: { ...t!, ...(e.double ? { double: true } : {}), ...(e.right ? { right: true } : {}) } }); if (e.navigated) addStep({ wait: 'load' }); break;
      case 'hover': addStep({ hover: t! }); break;
      case 'fill': case 'type': {
        let value = e.value ?? '';
        if (e.secret || e.value === undefined) {
          const v = `${nameSlug(e.target)}`;
          vars[v] = { required: true }; value = `{{${v}}}`;
          warnings.push(`Password value for "${e.target?.name ?? v}" was not recorded; supplied as {{${v}}} (use a vault reference or --var ${v}=...).`);
        }
        addStep({ fill: { ...t!, value } }); break;
      }
      case 'press': addStep({ press: e.value as string }); if (e.navigated) addStep({ wait: 'load' }); break;
      case 'check': addStep({ check: t! }); break;
      case 'uncheck': addStep({ uncheck: t! }); break;
      case 'select': addStep({ select: { ...t!, values: e.values ?? [] } }); break;
      case 'wait': if (['load', 'domcontentloaded', 'networkidle'].includes(String(e.value))) { const w = e.value as 'load'; const prev = steps[steps.length - 1] as { wait?: string } | undefined; if (prev?.wait !== w) addStep({ wait: w }); } break;
      default: warnings.push(`Skipped "${e.kind}" (not representable in a macro).`);
    }
  }
  // 2. extract {{vars}} appearing in values
  for (const s of steps) { const v = (s as any).fill?.value ?? (s as any).type?.value; for (const m of String(v ?? '').matchAll(/{{(\w+)}}/g)) vars[m[1]!] ??= { required: true }; }
  return { macro: { name, version: 1, vars, steps }, warnings };
}

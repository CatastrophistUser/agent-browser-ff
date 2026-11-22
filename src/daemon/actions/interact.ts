import fs from 'node:fs';
import { FpError } from '../../shared/errors.js';
import { type Handler, act, abs, resolve } from './common.js';

const isPassword = (d?: { inputType?: string }) => d?.inputType === 'password';

export const click: Handler = (c) => {
  const p = c.p;
  return act(c, p.double ? 'double-clicked' : p.right ? 'right-clicked' : 'clicked', p.target, 'click',
    (l) => l.click({ clickCount: p.double ? 2 : 1, button: p.right ? 'right' : 'left', modifiers: p.modifiers, timeout: c.timeout }),
    { double: !!p.double, right: !!p.right });
};
export const hover: Handler = (c) => act(c, 'hovered', c.p.target, 'hover', (l) => l.hover({ timeout: c.timeout }));

export const fill: Handler = async (c) => {
  const r = await resolve(c, c.p.target);
  const secret = isPassword(r.desc);
  return act(c, 'filled', c.p.target, 'fill', (l) => l.fill(c.p.text, { timeout: c.timeout }), { value: secret ? undefined : c.p.text, secret }, secret ? ' (password, not recorded)' : '');
};
export const type: Handler = async (c) => {
  const r = await resolve(c, c.p.target);
  const secret = isPassword(r.desc);
  return act(c, 'typed into', c.p.target, 'type', async (l) => { await l.click({ timeout: c.timeout }); await l.pressSequentially(c.p.text, { delay: c.p.delay ?? 0, timeout: c.timeout }); },
    { value: secret ? undefined : c.p.text, secret }, ` (${c.p.text.length} chars)`);
};
export const press: Handler = async (c) => {
  const s = c.s();
  await s.highlight(`press ${c.p.keys}`);
  const nav = s.navCounter;
  await s.page.keyboard.press(c.p.keys);
  await s.page.waitForTimeout(50);
  s.history.push({ kind: 'press', value: c.p.keys, navigated: s.navCounter !== nav });
  return { message: `pressed ${c.p.keys}` };
};
export const check: Handler = (c) => act(c, c.p.checked ? 'checked' : 'unchecked', c.p.target, c.p.checked ? 'check' : 'uncheck',
  (l) => (c.p.checked ? l.check({ timeout: c.timeout }) : l.uncheck({ timeout: c.timeout })));
export const select: Handler = (c) => act(c, 'selected', c.p.target, 'select', (l) => l.selectOption(c.p.values, { timeout: c.timeout }), { values: c.p.values }, ` ${c.p.values.join(', ')}`);

export const drag: Handler = async (c) => {
  const from = await resolve(c, c.p.from); const to = await resolve(c, c.p.to);
  await c.s().highlight(`drag ${from.label}`, from.loc);
  await from.loc.dragTo(to.loc, { timeout: c.timeout });
  c.s().history.push({ kind: 'drag', target: from.desc, to: to.desc });
  return { message: `dragged ${from.label} → ${to.label}` };
};

export const upload: Handler = async (c) => {
  const files = (c.p.files as string[]).map((f) => abs(c, f));
  for (const f of files) if (!fs.existsSync(f)) throw new FpError('E_BAD_ARGS', `File not found: ${f}`, 'Pass existing file paths.');
  return act(c, 'uploaded', c.p.target, 'upload', (l) => l.setInputFiles(files, { timeout: c.timeout }), {}, ` ${files.length} file(s)`);
};

export const scroll: Handler = async (c) => {
  const s = c.s(); const { target, to, by } = c.p;
  if (target === 'page') {
    await s.page.evaluate(([t, b]) => {
      if (t === 'top') window.scrollTo(0, 0); else if (t === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight);
      else window.scrollBy(0, b ?? window.innerHeight);
    }, [to, by] as const);
    return { message: `scrolled page ${to ?? `by ${by ?? 'one screen'}`}` };
  }
  const r = await resolve(c, target);
  if (to || by !== undefined) await r.loc.evaluate((el, [t, b]) => { if (t === 'top') el.scrollTop = 0; else if (t === 'bottom') el.scrollTop = el.scrollHeight; else el.scrollBy(0, b as number); }, [to, by] as const);
  else await r.loc.scrollIntoViewIfNeeded({ timeout: c.timeout });
  return { message: `scrolled ${r.label}` };
};

export const formFill: Handler = async (c) => {
  const form = await resolve(c, c.p.target);
  const done: string[] = [];
  for (const [key, val] of Object.entries(c.p.data as Record<string, string | number | boolean | string[]>)) {
    let f = form.loc.locator(`[name="${key}"], #${/^[\w-]+$/.test(key) ? key : '__none__'}`).first();
    if ((await f.count()) === 0) f = form.loc.getByLabel(key).first();
    if ((await f.count()) === 0) f = form.loc.getByPlaceholder(key).first();
    if ((await f.count()) === 0) throw new FpError('E_NOT_FOUND', `No field "${key}" in ${form.label}.`, 'Keys may be a field name, id, label or placeholder.');
    const info = await f.evaluate((el) => ({ tag: el.tagName.toLowerCase(), type: (el as HTMLInputElement).type }));
    if (info.type === 'checkbox') await (val ? f.check({ timeout: c.timeout }) : f.uncheck({ timeout: c.timeout }));
    else if (info.type === 'radio') await form.loc.locator(`input[type=radio][name="${key}"][value="${val}"]`).check({ timeout: c.timeout });
    else if (info.tag === 'select') await f.selectOption(Array.isArray(val) ? val : String(val), { timeout: c.timeout });
    else if (info.type === 'password') throw new FpError('E_BAD_ARGS', `Refusing to fill password field "${key}" from a data file.`, 'Use `agent-browser-ff vault fill` for passwords.');
    else await f.fill(String(val), { timeout: c.timeout });
    done.push(key);
  }
  c.s().history.push({ kind: 'form.fill', target: form.desc, keys: done });
  return { message: `filled ${done.length} field(s) in ${form.label}: ${done.join(', ')}` };
};

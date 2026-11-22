import type { Locator, Page } from 'playwright-core';
import type { Target, Step } from './schema.js';

export function sub(s: string, vars: Record<string, string>): string {
  return s.replace(/{{(\w+)}}/g, (_m, k: string) => { if (!(k in vars)) throw new Error(`Missing variable ${k}`); return vars[k]!; });
}

export function locate(page: Page, t: Target): Locator {
  let l: Locator;
  if (t.role) l = page.getByRole(t.role as never, { ...(t.name !== undefined ? { name: t.name, exact: true } : {}), ...(t.level ? { level: t.level } : {}) });
  else if (t.testid) l = page.getByTestId(t.testid);
  else if (t.label) l = page.getByLabel(t.label, { exact: true });
  else if (t.placeholder) l = page.getByPlaceholder(t.placeholder, { exact: true });
  else if (t.text) l = page.getByText(t.text);
  else l = page.locator(t.css ?? 'body');
  return l.nth(t.nth ?? 0);
}

/** Resolve with the primary locator, then the fallback. */
export async function resolveTarget(page: Page, primary: Target, fallback: Target | undefined, timeout: number): Promise<Locator> {
  const first = locate(page, primary);
  try { await first.waitFor({ state: 'visible', timeout: fallback ? Math.min(timeout, 3000) : timeout }); return first; }
  catch (e) {
    if (!fallback) throw e;
    const fb = locate(page, fallback);
    await fb.waitFor({ state: 'visible', timeout });
    return fb;
  }
}

export async function runStep(page: Page, step: Step, vars: Record<string, string>, timeout: number): Promise<void> {
  const k = Object.keys(step)[0] as string; const v = (step as any)[k];
  const tg = () => resolveTarget(page, v.target, v.fallback, timeout);
  switch (k) {
    case 'goto': await page.goto(sub(v, vars), { timeout }); break;
    case 'click': { const l = await tg(); await l.click({ clickCount: v.double ? 2 : 1, button: v.right ? 'right' : 'left', timeout }); break; }
    case 'hover': await (await tg()).hover({ timeout }); break;
    case 'fill': await (await tg()).fill(sub(v.value, vars), { timeout }); break;
    case 'type': await (await tg()).pressSequentially(sub(v.value, vars), { timeout }); break;
    case 'press': await page.keyboard.press(v); break;
    case 'check': await (await tg()).check({ timeout }); break;
    case 'uncheck': await (await tg()).uncheck({ timeout }); break;
    case 'select': await (await tg()).selectOption(v.values.map((x: string) => sub(x, vars)), { timeout }); break;
    case 'wait':
      if (typeof v === 'string') await page.waitForLoadState(v as 'load', { timeout });
      else if ('ms' in v) await page.waitForTimeout(v.ms);
      else if ('text' in v) await page.waitForFunction((x) => document.body.innerText.includes(x), sub(v.text, vars), { timeout });
      else await page.waitForURL(sub(v.url, vars), { timeout });
      break;
    case 'assert': {
      const l = await resolveTarget(page, v.target, v.fallback, timeout).catch((e) => { if (v.state === 'hidden') return null; throw e; });
      if (v.state === 'hidden') { if (l && (await l.isVisible())) throw new Error('element is visible'); }
      else if (v.state === 'visible' && !(await l!.isVisible())) throw new Error('element is not visible');
      if (v.text !== undefined && !(await l!.innerText()).includes(sub(v.text, vars))) throw new Error(`text does not contain ${v.text}`);
      if (v.value !== undefined && (await l!.inputValue()) !== sub(v.value, vars)) throw new Error('value mismatch');
      break;
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { FpError } from '../../shared/errors.js';
import { type Handler, abs, artifactPath } from './common.js';
import { fromHistory } from '../replay/normalize.js';
import { paths } from '../../shared/config.js';
import YAML from 'yaml';
import type { HistoryEntry } from '../sessions.js';

export const video: Handler = async (c) => {
  const s = c.s();
  if (c.p.action === 'start') {
    if (s.videoDir) throw new FpError('E_BAD_ARGS', 'Video is already recording.', 'Run `agent-browser-ff video stop` first.');
    const dir = path.join(c.cwd, '.agent-browser-ff', 'video-tmp-' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    await c.sessions.relaunch(c.name, { recordVideo: dir });
    return { message: 'video recording started (browser relaunched; session preserved)' };
  }
  if (!s.videoDir) throw new FpError('E_BAD_ARGS', 'Video is not recording.', 'Run `agent-browser-ff video start` first.');
  const dir = s.videoDir;
  const vids = (await Promise.all(s.pages.map((p) => p.video()?.path().catch(() => undefined)))).filter(Boolean) as string[];
  await c.sessions.relaunch(c.name, { recordVideo: null });
  const src = vids.find((v) => fs.existsSync(v)) ?? fs.readdirSync(dir).map((f) => path.join(dir, f))[0];
  if (!src) throw new FpError('E_GENERIC', 'No video was produced.');
  const dest = c.p.out ? abs(c, c.p.out) : artifactPath(c, `video-${Date.now()}.webm`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.rmSync(dir, { recursive: true, force: true });
  return { message: `video saved: ${dest}`, path: dest };
};

/** Injected into pages while recording a macro. Reports user events through the exposed binding. */
export const RECORDER_SCRIPT = `(() => {
  if (window.__fpRecInstalled) return; window.__fpRecInstalled = true;
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const roleOf = (el) => {
    const r = el.getAttribute('role'); if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return el.hasAttribute('href') ? 'link' : '';
    if (t === 'button') return 'button';
    if (t === 'select') return 'combobox';
    if (t === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'input') { const y = (el.type || 'text').toLowerCase();
      if (['submit','button','reset','image'].includes(y)) return 'button';
      if (y === 'checkbox' || y === 'radio') return y; if (y === 'search') return 'searchbox';
      if (y === 'number') return 'spinbutton'; return 'textbox'; }
    return '';
  };
  const path = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = []; let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
      const tag = cur.tagName.toLowerCase(); const p = cur.parentElement; if (!p) { parts.unshift(tag); break; }
      const same = [...p.children].filter((c) => c.tagName === cur.tagName);
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(cur) + 1) + ')' : tag); cur = p;
    }
    return parts.join(' > ');
  };
  const desc = (el) => {
    const role = roleOf(el); const lbl = el.labels && el.labels[0] ? norm(el.labels[0].textContent) : undefined;
    const name = norm(el.getAttribute('aria-label')) || lbl || (role === 'button' && el.tagName === 'INPUT' ? norm(el.value) : '') || norm(el.getAttribute('placeholder')) || norm(el.getAttribute('alt')) || (role === 'textbox' ? norm(el.getAttribute('name')) : '') || norm(el.textContent).slice(0, 80);
    const tag = el.tagName.toLowerCase();
    return { role, name, tag, css: path(el), label: lbl, placeholder: el.getAttribute('placeholder') || undefined, testid: el.getAttribute('data-testid') || undefined,
      text: norm(el.textContent).slice(0, 60) || undefined, level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined, inputType: tag === 'input' ? (el.type || 'text') : undefined };
  };
  const send = (ev) => { try { window.__fpRecord(ev); } catch (e) {} };
  const closest = (t) => t.closest ? t.closest('a,button,input,select,textarea,[role=button],[role=link],[onclick],summary') || t : t;
  document.addEventListener('click', (e) => {
    const el = closest(e.target); const tag = el.tagName; const y = (el.type || '').toLowerCase();
    if (tag === 'SELECT' || (tag === 'INPUT' && ['checkbox','radio','file'].includes(y))) return;
    send({ kind: 'click', target: desc(el) });
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target; if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (['checkbox','radio','file'].includes((el.type||'').toLowerCase())) return;
    const secret = el.type === 'password';
    send({ kind: 'fill', target: desc(el), value: secret ? undefined : el.value, secret });
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement) send({ kind: 'select', target: desc(el), values: [...el.selectedOptions].map((o) => o.value) });
    else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) send({ kind: el.checked ? 'check' : 'uncheck', target: desc(el) });
    else if (el instanceof HTMLInputElement && el.type === 'file') send({ kind: 'unsupported', value: 'file upload (path unknown)' });
  }, true);
  document.addEventListener('keydown', (e) => { if (['Enter','Escape','Tab'].includes(e.key)) send({ kind: 'press', value: e.key }); }, true);
})();`;

export const macroRecord: Handler = async (c) => {
  const s = c.s();
  if (s.recording) throw new FpError('E_BAD_ARGS', `Already recording macro "${s.recording.name}".`, 'Run `agent-browser-ff macro stop` first.');
  s.recording = { name: c.p.name, events: [], lastActionAt: 0 };
  if (!s.recorderBound) {
    await s.context.exposeBinding('__fpRecord', (_src, ev: HistoryEntry) => {
      const r = s.recording; if (!r) return;
      r.events.push(ev); r.lastActionAt = Date.now();
    });
    await s.context.addInitScript(RECORDER_SCRIPT);
    s.recorderBound = true;
    for (const p of s.pages) p.on('framenavigated', (f) => {
      const r = s.recording; if (!r || f !== p.mainFrame()) return;
      const last = r.events[r.events.length - 1];
      if (last && Date.now() - r.lastActionAt < 2500 && ['click', 'press'].includes(last.kind)) last.navigated = true;
      else r.events.push({ kind: 'goto', url: f.url() });
    });
  }
  await Promise.all(s.pages.map((p) => p.evaluate(RECORDER_SCRIPT).catch(() => undefined)));
  const first = s.page.url();
  if (first && first !== 'about:blank') s.recording.events.push({ kind: 'goto', url: first });
  return { message: `recording macro "${c.p.name}"${s.gui ? ' (perform the flow in the browser window)' : ''}; run \`agent-browser-ff macro stop\` when done` };
};

export const macroStop: Handler = async (c) => {
  const s = c.s(); const r = s.recording;
  if (!r) throw new FpError('E_BAD_ARGS', 'No macro is being recorded.', 'Run `agent-browser-ff macro record <name>` first.');
  s.recording = undefined;
  const { macro, warnings } = fromHistory(r.name, r.events.filter((e) => e.kind !== 'unsupported'));
  for (const e of r.events) if (e.kind === 'unsupported') warnings.push(`Skipped ${e.value}.`);
  if (!macro.steps.length) throw new FpError('E_BAD_ARGS', 'Nothing was recorded.', 'Interact with the page between record and stop.');
  fs.mkdirSync(paths.macros(), { recursive: true });
  fs.writeFileSync(path.join(paths.macros(), `${r.name}.yaml`), YAML.stringify(macro));
  return { message: `macro ${r.name} saved (${macro.steps.length} steps)${warnings.length ? '\nwarning: ' + warnings.join('\nwarning: ') : ''}`, steps: macro.steps.length, warnings };
};

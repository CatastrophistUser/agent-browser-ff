import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { FpError } from '../../shared/errors.js';
import { paths } from '../../shared/config.js';
import { type Handler, artifactPath } from './common.js';
import { macroSchema, type Macro } from '../replay/schema.js';
import { fromHistory } from '../replay/normalize.js';
import { migrate } from '../replay/migrate.js';
import { runStep } from '../replay/play.js';

const file = (name: string) => {
  if (!/^[\w.-]+$/.test(name)) throw new FpError('E_BAD_ARGS', `Invalid macro name "${name}".`, 'Use letters, digits, - _ and . only.');
  return path.join(paths.macros(), `${name}.yaml`);
};
export function loadMacro(name: string): Macro {
  const f = file(name);
  if (!fs.existsSync(f)) throw new FpError('E_NOT_FOUND', `No macro named "${name}".`, 'Run `agent-browser-ff macro list`.');
  const r = macroSchema.safeParse(migrate(YAML.parse(fs.readFileSync(f, 'utf8'))));
  if (!r.success) throw new FpError('E_BAD_ARGS', `Macro "${name}" is invalid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, `Fix it with \`agent-browser-ff macro edit ${name}\`.`);
  return r.data;
}

export const macroFromHistory: Handler = async (c) => {
  const s = c.s();
  const hist = c.p.last ? s.history.slice(-c.p.last) : s.history;
  if (!hist.length) throw new FpError('E_BAD_ARGS', 'No actions recorded in this session yet.', 'Run some commands first, then `macro from-history`.');
  const { macro, warnings } = fromHistory(c.p.name, hist);
  fs.mkdirSync(paths.macros(), { recursive: true });
  fs.writeFileSync(file(c.p.name), YAML.stringify(macro));
  return { message: `macro ${c.p.name} saved (${macro.steps.length} steps)${warnings.length ? '\nwarning: ' + warnings.join('\nwarning: ') : ''}`, steps: macro.steps.length, warnings };
};
export const macroList: Handler = async () => {
  const names = fs.existsSync(paths.macros()) ? fs.readdirSync(paths.macros()).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -5)) : [];
  return { message: names.length ? names.join('\n') : '(no macros)', macros: names };
};
export const macroShow: Handler = async (c) => { loadMacro(c.p.name); return { message: fs.readFileSync(file(c.p.name), 'utf8') }; };
export const macroDelete: Handler = async (c) => { loadMacro(c.p.name); fs.rmSync(file(c.p.name)); return { message: `macro ${c.p.name} deleted` }; };

export const macroBegin: Handler = async (c) => {
  const m = loadMacro(c.p.name); const s = c.s();
  const vars: Record<string, string> = {};
  for (const [k, d] of Object.entries(m.vars)) {
    const v = c.p.vars[k] ?? d.default;
    if (v === undefined && d.required) throw new FpError('E_BAD_ARGS', `Macro "${m.name}" needs --var ${k}=<value>.`, `Pass --var ${k}=...`);
    if (v !== undefined) vars[k] = v;
  }
  s.macroPlay = { steps: m.steps, vars, name: m.name };
  return { message: `macro ${m.name} ready: ${m.steps.length} steps`, total: m.steps.length, steps: m.steps.map((x) => Object.keys(x)[0]) };
};
export const macroStep: Handler = async (c) => {
  const s = c.s(); const mp = s.macroPlay;
  if (!mp) throw new FpError('E_BAD_ARGS', 'No macro is loaded.', 'Call macro begin first.');
  const step = mp.steps[c.p.index] as any;
  try { await runStep(s.page, step, mp.vars, c.timeout); }
  catch (e) {
    const shot = artifactPath(c, `macro-${mp.name}-step${c.p.index}.png`);
    await s.page.screenshot({ path: shot }).catch(() => undefined);
    throw new FpError('E_MACRO_STEP_FAILED', `Macro ${mp.name} failed at step ${c.p.index} (${Object.keys(step)[0]}): ${(e as Error).message.split('\n')[0]}`, `Screenshot saved to ${shot}. Fix the step with \`agent-browser-ff macro edit ${mp.name}\` and replay.`);
  }
  s.refs.invalidate();
  return { message: `step ${c.p.index} ok: ${Object.keys(step)[0]}` };
};

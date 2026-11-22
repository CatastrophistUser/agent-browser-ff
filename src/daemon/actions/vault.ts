import { FpError } from '../../shared/errors.js';
import { scrubSecrets } from '../../shared/redact.js';
import { type Handler, resolve, artifactPath } from './common.js';
import { vaultGet, vaultField, type VaultField } from '../vault/store.js';
import { totp } from '../vault/totp.js';
import { loadMacro } from './macros.js';
import { runStep } from '../replay/play.js';

export const vaultFill: Handler = async (c) => {
  const [key, field] = String(c.p.key).split('.');
  if (!key || !['username', 'password', 'totp'].includes(field ?? '')) throw new FpError('E_BAD_ARGS', `Invalid vault reference "${c.p.key}".`, 'Use <key>.username, <key>.password or <key>.totp');
  const value = vaultField(key, field as VaultField, c.p.passphrase);
  const r = await resolve(c, c.p.target);
  await c.s().highlight(`vault fill ${key}.${field}`, r.loc);
  try { await r.loc.fill(value, { timeout: c.timeout }); }
  catch (e) { throw new FpError('E_GENERIC', scrubSecrets((e as Error).message.split('\n')[0]!, [value])); }
  // recorded as a secret reference, so macros get {{variables}} rather than the value
  c.s().history.push({ kind: 'fill', target: r.desc, secret: true, vault: `${key}.${field}` });
  return { message: `filled ${key}.${field} into ${c.p.target}` };
};

export const login: Handler = async (c) => {
  const s = c.s(); const key = String(c.p.key);
  const entry = vaultGet(key, c.p.passphrase);
  const m = loadMacro(c.p.macro);
  const vars: Record<string, string> = {};
  if (entry.username) vars.username = entry.username;
  if (entry.password) vars.password = entry.password;
  if (entry.totpSeed) vars.totp = totp(entry.totpSeed);
  const secrets = Object.values(vars);
  for (const [k, d] of Object.entries(m.vars)) if (!(k in vars) && d.required) throw new FpError('E_BAD_ARGS', `Macro "${m.name}" needs variable "${k}", which the vault entry "${key}" does not provide.`, 'Use username, password or totp as macro variable names.');
  for (let i = 0; i < m.steps.length; i++) {
    try { await runStep(s.page, m.steps[i]!, vars, c.timeout); }
    catch (e) {
      const shot = artifactPath(c, `login-${key}-step${i}.png`);
      await s.page.screenshot({ path: shot }).catch(() => undefined);
      throw new FpError('E_MACRO_STEP_FAILED', scrubSecrets(`Login macro ${m.name} failed at step ${i}: ${(e as Error).message.split('\n')[0]}`, secrets), `Screenshot saved to ${shot}. Fix the macro with \`agent-browser-ff macro edit ${m.name}\`.`);
    }
  }
  s.refs.invalidate();
  return { message: `logged in with ${key} via macro ${m.name} (${m.steps.length} steps)` };
};

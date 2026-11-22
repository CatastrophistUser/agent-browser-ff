import { FpError } from '../../shared/errors.js';
import { redactUrl } from '../../shared/redact.js';
import type { Handler } from './common.js';

export const sessionNew: Handler = async (c) => {
  const name = c.p.name;
  if (c.sessions.has(name)) throw new FpError('E_BAD_ARGS', `Session "${name}" already exists.`, 'Pick another name or `session close` it first.');
  await c.sessions.launch(name, { gui: false, slowmo: 0, persistent: !!c.p.persistent });
  return { message: `session ${name} created${c.p.persistent ? ' (persistent)' : ''}` };
};
export const sessionList: Handler = async (c) => {
  const rows = [...c.sessions.map.values()].map((s) => `${s.name}${s.persistent ? ' [persistent]' : ''}${s.gui ? ' [gui]' : ''} ${s.pages[s.cur] ? redactUrl(s.pages[s.cur]!.url()) : ''}`);
  return { message: rows.length ? rows.join('\n') : '(no open sessions)', sessions: [...c.sessions.map.keys()] };
};
export const sessionClose: Handler = async (c) => {
  if (!c.sessions.has(c.p.name)) throw new FpError('E_NO_SESSION', `No open session "${c.p.name}".`);
  await c.sessions.close(c.p.name);
  return { message: `session ${c.p.name} closed` };
};

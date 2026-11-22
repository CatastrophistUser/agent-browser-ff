import os from 'node:os';
import path from 'node:path';

export function home(): string {
  return process.env.AGENT_BROWSER_FF_HOME ?? path.join(os.homedir(), '.agent-browser-ff');
}
export const paths = {
  run: () => path.join(home(), 'run'),
  socket: () => process.platform === 'win32' ? '\\\\.\\pipe\\agent-browser-ff-daemon' : path.join(home(), 'run', 'daemon.sock'),
  logs: () => path.join(home(), 'logs'),
  log: () => path.join(home(), 'logs', 'daemon.log'),
  macros: () => path.join(home(), 'macros'),
  profiles: () => path.join(home(), 'profiles'),
  vault: () => path.join(home(), 'vault.json'),
  current: () => path.join(home(), 'current-session'),
};
export function idleMs(): number {
  const v = Number(process.env.AGENT_BROWSER_FF_IDLE_MS);
  return Number.isFinite(v) && v > 0 ? v : 15 * 60 * 1000;
}
export const DEFAULT_TIMEOUT = 10_000;

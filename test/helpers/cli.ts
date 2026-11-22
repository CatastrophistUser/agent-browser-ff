import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './server.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli.js');
export interface Out { code: number; stdout: string; stderr: string; json?: any }

export async function setup(extraEnv?: Record<string, string>) {
  const server = await startFixtureServer();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fpw-'));
  const env = { ...process.env, AGENT_BROWSER_FF_HOME: home, AGENT_BROWSER_FF_VAULT_KEYCHAIN: 'off', AGENT_BROWSER_FF_VAULT_PASSPHRASE: 'test-passphrase', ...(extraEnv ?? {}) };
  const run = (input: string | undefined, args: string[]): Out => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, cwd, encoding: 'utf8', timeout: 90_000, input });
    const out: Out = { code: r.status ?? -1, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
    if (args.includes('--json')) { try { out.json = JSON.parse(r.stdout); } catch { /* not json */ } }
    log.push(out.stdout, out.stderr);
    return out;
  };
  const log: string[] = [];
  const fp = (...args: string[]): Out => run(undefined, args);
  const fpIn = (input: string, ...args: string[]): Out => run(input, args);
  /** Snapshot and return a map of "role name" -> ref. */
  const refs = (extra: string[] = []): Record<string, string> => {
    const s = fp('snapshot', ...extra).stdout;
    const m: Record<string, string> = {};
    for (const l of s.split('\n')) { const x = /^\s*(@e\d+) (\S+) "([^"]*)"/.exec(l); if (x) m[`${x[2]} ${x[3]}`] = x[1]!; }
    return m;
  };
  const teardown = async () => { fp('close'); fp('daemon', 'stop'); await server.close(); fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(cwd, { recursive: true, force: true }); };
  return { url: server.url, fp, fpIn, log, env, refs, home, cwd, teardown };
}

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Serves test/fixtures from a separate process (the CLI is driven with spawnSync, which would block an in-process server). */
export function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const impl = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server-impl.mjs');
  const child = spawn(process.execPath, [impl], { stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    child.stdout.once('data', (d) => resolve({ url: `http://127.0.0.1:${String(d).trim()}`, close: async () => { child.kill(); } }));
    child.once('error', reject);
  });
}

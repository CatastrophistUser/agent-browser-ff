import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FpError } from '../shared/errors.js';
import { paths } from '../shared/config.js';
import type { RpcResponse } from '../shared/protocol.js';

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.connect(paths.socket());
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
}

export async function ensureDaemon(): Promise<void> {
  try { (await connect()).destroy(); return; } catch { /* not running */ }
  fs.mkdirSync(paths.run(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.logs(), { recursive: true, mode: 0o700 });
  const main = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon', 'main.js');
  const out = fs.openSync(paths.log(), 'a');
  const child = spawn(process.execPath, [main], { detached: true, stdio: ['ignore', out, out], env: process.env });
  child.unref();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { (await connect()).destroy(); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new FpError('E_DAEMON', 'Daemon did not start.', `See ${paths.log()}`);
}

let nextId = 1;
export async function call(method: string, params: Record<string, unknown>, opts: { spawn?: boolean } = {}): Promise<NonNullable<RpcResponse['result']>> {
  if (opts.spawn !== false) await ensureDaemon();
  let sock: net.Socket;
  try { sock = await connect(); } catch { throw new FpError('E_DAEMON', 'Daemon is not running.', 'Any agent-browser-ff command starts it; check `agent-browser-ff daemon status`.'); }
  const id = nextId++;
  const res = await new Promise<RpcResponse>((resolve, reject) => {
    let buf = '';
    sock.on('data', (d) => { buf += d.toString('utf8'); const i = buf.indexOf('\n'); if (i >= 0) { try { resolve(JSON.parse(buf.slice(0, i))); } catch (e) { reject(e); } sock.end(); } });
    sock.on('error', reject);
    sock.on('close', () => reject(new FpError('E_DAEMON', 'Daemon closed the connection.', 'Run `agent-browser-ff daemon status`.')));
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { cwd: process.cwd(), ...params } }) + '\n');
  });
  if (res.error) throw new FpError((res.error.data?.code as never) ?? 'E_GENERIC', res.error.message, res.error.data?.hint);
  return res.result!;
}

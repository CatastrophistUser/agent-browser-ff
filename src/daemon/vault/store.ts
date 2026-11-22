import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FpError } from '../../shared/errors.js';
import { paths } from '../../shared/config.js';
import { totp } from './totp.js';

export interface VaultEntry { username?: string; password?: string; totpSeed?: string }
interface Item { iv: string; tag: string; ct: string }
interface VaultFile { v: 1; kdf: 'keychain' | 'scrypt'; salt?: string; items: Record<string, Item> }

const SERVICE = 'agent-browser-ff', ACCOUNT = 'vault-key';

function keychainGet(): string | null {
  if (process.env.AGENT_BROWSER_FF_VAULT_KEYCHAIN === 'off') return null;
  const r = process.platform === 'darwin' ? spawnSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], { encoding: 'utf8' })
    : process.platform === 'linux' ? spawnSync('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT], { encoding: 'utf8' }) : null;
  return r && r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}
function keychainSet(hex: string): boolean {
  if (process.env.AGENT_BROWSER_FF_VAULT_KEYCHAIN === 'off') return false;
  const r = process.platform === 'darwin' ? spawnSync('security', ['add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', hex, '-U'], { encoding: 'utf8' })
    : process.platform === 'linux' ? spawnSync('secret-tool', ['store', '--label=agent-browser-ff vault key', 'service', SERVICE, 'account', ACCOUNT], { input: hex, encoding: 'utf8' }) : null;
  return !!r && r.status === 0;
}

function read(): VaultFile | null {
  const f = paths.vault();
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as VaultFile) : null;
}
function write(v: VaultFile) {
  fs.mkdirSync(path.dirname(paths.vault()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(paths.vault(), JSON.stringify(v, null, 2), { mode: 0o600 });
}

function deriveKey(vf: VaultFile, passphrase?: string): Buffer {
  if (vf.kdf === 'keychain') {
    const hex = keychainGet();
    if (!hex) throw new FpError('E_VAULT', 'Vault key not found in the OS keychain.', 'Unlock the keychain, or recreate the vault.');
    return Buffer.from(hex, 'hex');
  }
  const pass = passphrase ?? process.env.AGENT_BROWSER_FF_VAULT_PASSPHRASE;
  if (!pass) throw new FpError('E_VAULT', 'Vault passphrase required (no OS keychain in use).', 'Set AGENT_BROWSER_FF_VAULT_PASSPHRASE or run from a terminal to be prompted.');
  return crypto.scryptSync(pass, Buffer.from(vf.salt!, 'hex'), 32);
}

function openOrCreate(passphrase?: string): { vf: VaultFile; key: Buffer } {
  let vf = read();
  if (vf) return { vf, key: deriveKey(vf, passphrase) };
  const hex = crypto.randomBytes(32).toString('hex');
  if (keychainSet(hex)) { vf = { v: 1, kdf: 'keychain', items: {} }; write(vf); return { vf, key: Buffer.from(hex, 'hex') }; }
  const pass = passphrase ?? process.env.AGENT_BROWSER_FF_VAULT_PASSPHRASE;
  if (!pass) throw new FpError('E_VAULT', 'No OS keychain available and no passphrase given.', 'Set AGENT_BROWSER_FF_VAULT_PASSPHRASE, or run from a terminal to be prompted.');
  vf = { v: 1, kdf: 'scrypt', salt: crypto.randomBytes(16).toString('hex'), items: {} };
  write(vf);
  return { vf, key: crypto.scryptSync(pass, Buffer.from(vf.salt!, 'hex'), 32) };
}

function seal(key: Buffer, entry: VaultEntry): Item {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(entry), 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), ct: ct.toString('hex') };
}
function unseal(key: Buffer, it: Item): VaultEntry {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(it.iv, 'hex'));
    d.setAuthTag(Buffer.from(it.tag, 'hex'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(it.ct, 'hex')), d.final()]).toString('utf8'));
  } catch { throw new FpError('E_VAULT', 'Could not decrypt the vault entry (wrong passphrase or corrupted vault).', 'Check the passphrase.'); }
}

export function vaultAdd(name: string, entry: VaultEntry, passphrase?: string) {
  if (!/^[\w.@-]+$/.test(name)) throw new FpError('E_BAD_ARGS', `Invalid vault key "${name}".`, 'Use letters, digits, - _ . @');
  const { vf, key } = openOrCreate(passphrase);
  vf.items[name] = seal(key, entry);
  write(vf);
}
export function vaultList(): string[] { return Object.keys(read()?.items ?? {}).sort(); }
export function vaultRemove(name: string) {
  const vf = read();
  if (!vf?.items[name]) throw new FpError('E_VAULT', `No vault entry "${name}".`, 'Run `agent-browser-ff vault list`.');
  delete vf.items[name]; write(vf);
}
export function vaultGet(name: string, passphrase?: string): VaultEntry {
  const vf = read();
  const it = vf?.items[name];
  if (!vf || !it) throw new FpError('E_VAULT', `No vault entry "${name}".`, 'Ask the user to run `agent-browser-ff vault add ' + name + '`.');
  return unseal(deriveKey(vf, passphrase), it);
}

export type VaultField = 'username' | 'password' | 'totp';
export function vaultField(name: string, field: VaultField, passphrase?: string): string {
  const e = vaultGet(name, passphrase);
  const v = field === 'totp' ? (e.totpSeed ? totp(e.totpSeed) : undefined) : e[field];
  if (!v) throw new FpError('E_VAULT', `Vault entry "${name}" has no ${field}.`, `Re-add it with \`agent-browser-ff vault add ${name}\`${field === 'totp' ? ' --totp' : ''}.`);
  return v;
}

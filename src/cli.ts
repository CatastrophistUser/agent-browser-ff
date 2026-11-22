#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import YAML from 'yaml';
import { call } from './client/index.js';
import { FpError, EXIT } from './shared/errors.js';
import { paths } from './shared/config.js';
import { nodeSupportsSkills, skillInstallArgs, SKILLS_MIN_NODE, parseYesNo, dirOnPath, globalBinDir, formatSummary, type StepResult } from './install.js';
import { scrapeSchema } from './daemon/scrape/schema.js';
import { vaultAdd, vaultList, vaultRemove } from './daemon/vault/store.js';
import { createRequire } from 'node:module';
import path from 'node:path';

const VERSION = '0.1.0';
const program = new Command();
program.name('agent-browser-ff').description('Firefox browser automation for AI agents and humans').version(VERSION)
  .showHelpAfterError().exitOverride();

function sessionName(opts: any): string {
  if (opts.session) return opts.session;
  try { return fs.readFileSync(paths.current(), 'utf8').trim() || 'default'; } catch { return 'default'; }
}
const withCommon = (c: Command) => c.option('--session <name>', 'session name').option('--json', 'machine-readable output').option('--timeout <ms>', 'timeout in ms', (v) => Number(v));

/** Register a command that sends one RPC and prints the result. */
function cmd(parent: Command, spec: string, desc: string, build: (c: Command) => void, method: string, params: (args: any[], opts: any) => Record<string, unknown> | Promise<Record<string, unknown>>, after?: (res: any, opts: any) => void | Promise<void>) {
  const c = parent.command(spec).description(desc);
  build(c); withCommon(c);
  c.action(async (...a: any[]) => {
    const command: Command = a[a.length - 1]; const opts = command.opts(); const args = a.slice(0, -2);
    await run(opts, async () => {
      const res = await call(method, { session: sessionName(opts), timeout: opts.timeout, ...(await params(args, opts)) });
      await after?.(res, opts);
      return res;
    });
  });
  return c;
}

async function run(opts: any, fn: () => Promise<{ message: string; [k: string]: unknown }>) {
  try {
    const res = await fn();
    if (opts.json) console.log(JSON.stringify({ ok: true, result: res }));
    else console.log(res.message);
  } catch (e) {
    const err = e instanceof FpError ? e : new FpError('E_GENERIC', e instanceof Error ? e.message : String(e));
    if (opts.json) console.log(JSON.stringify({ ok: false, error: err.toJSON() }));
    else { console.error(`error ${err.code}: ${err.message}`); if (err.hint) console.error(`hint: ${err.hint}`); }
    process.exitCode = err.exitCode;
  }
}
const no: (c: Command) => void = () => undefined;
const num = (v: string) => Number(v);

// Launch and mode
cmd(program, 'open [url]', 'launch (or reuse) the browser and open a page', (c) => c.option('--gui', 'run headed').option('--slowmo <ms>', 'slow motion ms', num).option('--viewport <WxH>', 'viewport size').option('--device <name>', 'device emulation').option('--persistent', 'use a persistent profile'),
  'open', ([url], o) => ({ url, gui: o.gui, slowmo: o.slowmo, viewport: o.viewport, device: o.device, persistent: o.persistent }));
const gui = program.command('gui').description('switch GUI mode');
for (const m of ['on', 'off']) cmd(gui, m, `turn GUI mode ${m}`, no, 'gui', () => ({ on: m === 'on' }));
cmd(program, 'close', 'close the session', no, 'close', () => ({}));
const daemon = program.command('daemon').description('manage the daemon');
for (const m of ['status', 'stop']) {
  const c = daemon.command(m).description(`daemon ${m}`); withCommon(c);
  c.action(async (_o, command: Command) => run(command.opts(), async () => {
    try { return await call(`daemon.${m}`, {}, { spawn: false }); }
    catch (e) { if (m === 'status' && e instanceof FpError && e.code === 'E_DAEMON') return { message: 'daemon not running' }; if (m === 'stop' && e instanceof FpError && e.code === 'E_DAEMON') return { message: 'daemon not running' }; throw e; }
  }));
}

// Navigation
cmd(program, 'goto <url>', 'navigate to a URL', no, 'goto', ([url]) => ({ url }));
for (const m of ['back', 'forward', 'reload']) cmd(program, m, `go ${m}`, no, m, () => ({}));
cmd(program, 'follow <ref>', 'click a link and wait for load', no, 'follow', ([t]) => ({ target: t }));
const waitCmd = program.command('wait').description('wait for a condition');
for (const k of ['load', 'domcontentloaded', 'networkidle']) cmd(waitCmd, k, `wait for ${k}`, no, 'wait', () => ({ kind: k }));
cmd(waitCmd, 'selector <target>', 'wait for a ref/selector', (c) => c.option('--state <state>', 'visible|hidden|attached|detached'), 'wait', ([t], o) => ({ kind: 'selector', value: t, state: o.state }));
cmd(waitCmd, 'text <text>', 'wait for text', no, 'wait', ([t]) => ({ kind: 'text', value: t }));
cmd(waitCmd, 'url <pattern>', 'wait for URL glob', no, 'wait', ([t]) => ({ kind: 'url', value: t }));
cmd(waitCmd, 'ms <n>', 'wait n milliseconds', no, 'wait', ([t]) => ({ kind: 'ms', value: t }));
cmd(program, 'paginate', 'click a next control repeatedly', (c) => c.requiredOption('--next <target>').option('--max-pages <n>', '', num).option('--until-missing'), 'paginate', (_a, o) => ({ next: o.next, maxPages: o.maxPages, untilMissing: o.untilMissing }));
const tabs = program.command('tabs').description('manage tabs');
cmd(tabs, 'list', 'list tabs', no, 'tabs', () => ({ action: 'list' }));
cmd(tabs, 'new [url]', 'open a new tab', no, 'tabs', ([url]) => ({ action: 'new', url }));
cmd(tabs, 'switch <id>', 'switch tab', no, 'tabs', ([id]) => ({ action: 'switch', id: Number(id) }));
cmd(tabs, 'close <id>', 'close tab', no, 'tabs', ([id]) => ({ action: 'close', id: Number(id) }));

// Interaction
cmd(program, 'click <target>', 'click an element', (c) => c.option('--double').option('--right').option('--modifiers <list>', 'Shift,Alt'), 'click', ([t], o) => ({ target: t, double: o.double, right: o.right, modifiers: o.modifiers?.split(',') }));
cmd(program, 'hover <target>', 'hover an element', no, 'hover', ([t]) => ({ target: t }));
cmd(program, 'type <target> <text>', 'type keystrokes into an element', (c) => c.option('--delay <ms>', '', num), 'type', ([t, x], o) => ({ target: t, text: x, delay: o.delay }));
cmd(program, 'fill <target> <text>', 'set an input value', no, 'fill', ([t, x]) => ({ target: t, text: x }));
cmd(program, 'press <keys>', 'press a key combo', no, 'press', ([k]) => ({ keys: k }));
cmd(program, 'check <target>', 'check a checkbox', no, 'check', ([t]) => ({ target: t, checked: true }));
cmd(program, 'uncheck <target>', 'uncheck a checkbox', no, 'check', ([t]) => ({ target: t, checked: false }));
cmd(program, 'select <target> <values...>', 'select dropdown option(s)', no, 'select', ([t, v]) => ({ target: t, values: v }));
cmd(program, 'drag <from> <to>', 'drag one element onto another', no, 'drag', ([f, t]) => ({ from: f, to: t }));
cmd(program, 'upload <target> <files...>', 'upload files to an input', no, 'upload', ([t, f]) => ({ target: t, files: f }));
cmd(program, 'scroll <target>', 'scroll a ref/selector or "page"', (c) => c.option('--to <where>', 'top|bottom').option('--by <px>', '', num), 'scroll', ([t], o) => ({ target: t, to: o.to, by: o.by }));
const form = program.command('form').description('form helpers');
cmd(form, 'fill <form-ref>', 'fill a form from a JSON file', (c) => c.requiredOption('--data <file>'), 'form.fill', ([t], o) => ({ target: t, data: JSON.parse(fs.readFileSync(o.data, 'utf8')) }));

// Extraction
cmd(program, 'snapshot', 'print the page tree with refs', (c) => c.option('--full').option('--selector <sel>'), 'snapshot', (_a, o) => ({ full: o.full, selector: o.selector }));
cmd(program, 'text <target>', 'get element text', (c) => c.option('--all'), 'text', ([t], o) => ({ target: t, all: o.all }));
cmd(program, 'attr <target> <name>', 'get an attribute', (c) => c.option('--all'), 'attr', ([t, n], o) => ({ target: t, name: n, all: o.all }));
cmd(program, 'html <target>', 'get element HTML', (c) => c.option('--outer'), 'html', ([t], o) => ({ target: t, outer: o.outer }));
cmd(program, 'eval <expression>', 'evaluate a JS expression in the page', (c) => c.option('--arg <json>'), 'eval', ([e], o) => ({ expression: e, arg: o.arg ? JSON.parse(o.arg) : undefined }));
cmd(program, 'screenshot [target]', 'save a screenshot', (c) => c.option('--full-page').option('--out <file>').option('--with-overlay'), 'screenshot', ([t], o) => ({ target: t, fullPage: o.fullPage, out: o.out, withOverlay: o.withOverlay }));
cmd(program, 'pdf', 'save a PDF (unsupported on Firefox)', (c) => c.requiredOption('--out <file>'), 'pdf', (_a, o) => ({ out: o.out }));
cmd(program, 'console', 'show console messages', (c) => c.option('--follow', 'keep printing new messages (Ctrl-C to stop)').option('--level <level>'), 'console', (_a, o) => ({ level: o.level }), async (res, o) => {
  if (!o.follow || o.json) return;
  let since = res.count as number;
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const next = await call('console', { session: sessionName(o), level: o.level, since });
    since = next.count as number;
    for (const e of (next.entries as { level: string; text: string }[])) console.log(`[${e.level}] ${e.text}`);
  }
});
cmd(program, 'network', 'show network requests', (c) => c.option('--filter <pattern>').option('--har <file>'), 'network', (_a, o) => ({ filter: o.filter, har: o.har }));
const test = program.command('test').description('assertions');
cmd(test, 'assert <target> <kind> [expected]', 'assert visible|hidden|text|value|count', no, 'assert', ([t, k, e]) => ({ target: t, kind: k, expected: e }));

// Scraping
cmd(program, 'scrape', 'extract structured data with a schema', (c) => c.requiredOption('--schema <file>').option('--paginate-next <selector>').option('--max-pages <n>', '', num).option('--out <file>').option('--format <fmt>', 'json|jsonl|csv', 'json'), 'scrape', (_a, o) => {
  const raw = fs.readFileSync(o.schema, 'utf8');
  const schema = o.schema.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
  const v = scrapeSchema.safeParse(schema);
  if (!v.success) throw new FpError('E_BAD_ARGS', `Invalid schema: ${v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'Fix the schema and retry.');
  return { schema, paginateNext: o.paginateNext, maxPages: o.maxPages, out: o.out, format: o.format };
});

// Sessions
const session = program.command('session').description('manage sessions');
cmd(session, 'new <name>', 'create a session', (c) => c.option('--persistent'), 'session.new', ([n], o) => ({ name: n, persistent: o.persistent }));
cmd(session, 'list', 'list sessions', no, 'session.list', () => ({}));
cmd(session, 'close <name>', 'close a session', no, 'session.close', ([n]) => ({ name: n }));
session.command('use <name>').description('make a session the default').action((n: string) => { fs.mkdirSync(paths.current().replace(/[^/\\]+$/, ''), { recursive: true }); fs.writeFileSync(paths.current(), n); console.log(`default session is now ${n}`); });
const state = program.command('state').description('save/load storage state');
cmd(state, 'save <file>', 'save cookies and localStorage', no, 'state.save', ([f]) => ({ file: f }));
cmd(state, 'load <file>', 'load cookies and localStorage', no, 'state.load', ([f]) => ({ file: f }));

// Macros
const macro = program.command('macro').description('record and replay macros');
cmd(macro, 'from-history <name>', 'create a macro from recent actions', (c) => c.option('--last <n>', '', num), 'macro.fromHistory', ([n], o) => ({ name: n, last: o.last }));
cmd(macro, 'list', 'list macros', no, 'macro.list', () => ({}));
cmd(macro, 'show <name>', 'print a macro', no, 'macro.show', ([n]) => ({ name: n }));
cmd(macro, 'delete <name>', 'delete a macro', no, 'macro.delete', ([n]) => ({ name: n }));
macro.command('edit <name>').description('edit a macro in $EDITOR').action((name: string) => {
  const f = `${paths.macros()}/${name}.yaml`;
  if (!fs.existsSync(f)) { console.error(`error E_NOT_FOUND: no macro ${name}`); process.exitCode = EXIT.NOT_FOUND; return; }
  spawnSync(process.env.EDITOR ?? 'vi', [f], { stdio: 'inherit' });
});
{
  const c = macro.command('play <name>').description('replay a macro').option('--var <k=v...>', 'variable', (v: string, p: string[] = []) => [...p, v]).option('--speed <x>', '', num).option('--step', 'pause before each step').option('--gui', 'run headed');
  withCommon(c);
  c.action(async (name: string, opts: any) => run(opts, async () => {
    const vars: Record<string, string> = {};
    for (const kv of opts.var ?? []) { const i = String(kv).indexOf('='); if (i < 1) throw new FpError('E_BAD_ARGS', `Bad --var "${kv}"`, 'Use --var key=value'); vars[kv.slice(0, i)] = kv.slice(i + 1); }
    const base = { session: sessionName(opts), timeout: opts.timeout };
    if (opts.gui) await call('open', { ...base, gui: true });
    const begin = await call('macro.begin', { ...base, name, vars });
    const total = begin.total as number;
    const rl = opts.step ? readline.createInterface({ input: process.stdin }) : undefined;
    const lines = rl?.[Symbol.asyncIterator]();
    for (let i = 0; i < total; i++) {
      if (lines) { process.stderr.write(`step ${i + 1}/${total} (${(begin.steps as string[])[i]}) — press Enter\n`); await lines.next(); }
      await call('macro.step', { ...base, index: i });
      if (opts.speed && opts.speed > 0) await new Promise((r) => setTimeout(r, 250 / opts.speed));
    }
    rl?.close();
    return { message: `macro ${name} completed (${total} steps)` };
  }));
}

// Crawl, video
cmd(program, 'crawl <start-url>', 'crawl pages matching a glob and extract data', (c) => c.requiredOption('--match <glob>').requiredOption('--schema <file>').option('--max-pages <n>', '', num).option('--concurrency <n>', '', num).option('--delay <ms>', '', num).option('--ignore-robots', 'ignore robots.txt (use only on sites you own)').option('--out <file>').option('--format <fmt>', 'json|jsonl|csv', 'json'), 'crawl', ([u], o) => {
  const raw = fs.readFileSync(o.schema, 'utf8');
  const schema = o.schema.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
  const v = scrapeSchema.safeParse(schema);
  if (!v.success) throw new FpError('E_BAD_ARGS', `Invalid schema: ${v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  if (o.ignoreRobots) console.error('warning: --ignore-robots disables robots.txt checks; only use on sites you own or are authorized to crawl');
  return { url: u, match: o.match, schema, maxPages: o.maxPages, concurrency: o.concurrency, delay: o.delay, ignoreRobots: o.ignoreRobots, out: o.out, format: o.format };
});
const video = program.command('video').description('record video of the session');
cmd(video, 'start', 'start recording', no, 'video', () => ({ action: 'start' }));
cmd(video, 'stop', 'stop recording and save the file', (c) => c.option('--out <file>'), 'video', (_a, o) => ({ action: 'stop', out: o.out }));

// Macro record / stop
cmd(macro, 'record <name>', 'record a macro while a human drives the browser', (c) => c.option('--gui', 'open headed so a human can perform the flow'), 'macro.record', async ([n], o) => { if (o.gui) await call('open', { session: sessionName(o), gui: true, timeout: o.timeout }); return { name: n }; });
cmd(macro, 'stop', 'stop recording and save the macro', no, 'macro.stop', () => ({}));

// Vault
async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); return Buffer.concat(chunks).toString('utf8').split('\n')[0]!.replace(/\r$/, ''); }
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    const stdin = process.stdin; stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n'); return resolve(buf); }
        if (c === '\u0003') { stdin.setRawMode(false); process.exit(130); }
        if (c === '\u007f') buf = buf.slice(0, -1); else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}
async function readLines(): Promise<string[]> { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); return Buffer.concat(chunks).toString('utf8').split('\n').map((l) => l.replace(/\r$/, '')); }
/** Retry once with a prompted passphrase when the vault has no OS keychain. */
async function withPassphrase<T>(fn: (pass?: string) => Promise<T> | T): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof FpError && e.code === 'E_VAULT' && /passphrase/i.test(e.message) && process.stdin.isTTY) return fn(await readSecret('Vault passphrase: '));
    throw e;
  }
}
const vault = program.command('vault').description('encrypted credential vault');
{
  const c = vault.command('add <key>').description('store credentials (password read from stdin or a prompt, never argv)').option('--username <u>').option('--totp', 'also read a TOTP seed (second stdin line / prompt)');
  withCommon(c);
  c.action(async (key: string, opts: any) => run(opts, async () => {
    let password: string; let seed: string | undefined;
    if (process.stdin.isTTY) { password = await readSecret(`Password for ${key}: `); if (opts.totp) seed = await readSecret('TOTP seed (base32): '); }
    else { const l = await readLines(); password = l[0] ?? ''; if (opts.totp) seed = l[1]; }
    if (!password && !seed) throw new FpError('E_BAD_ARGS', 'No password provided.', 'Pipe it on stdin or run in a terminal.');
    await withPassphrase((pass) => vaultAdd(key, { username: opts.username, password: password || undefined, totpSeed: seed || undefined }, pass));
    return { message: `vault: stored ${key}${opts.username ? ` (username ${opts.username})` : ''}${seed ? ' with TOTP seed' : ''}` };
  }));
}
{
  const l = vault.command('list').description('list vault keys'); withCommon(l);
  l.action(async (_o: any, command: Command) => run(command.opts(), async () => { const k = vaultList(); return { message: k.length ? k.join('\n') : '(vault is empty)', keys: k }; }));
  const r = vault.command('remove <key>').description('remove a vault entry'); withCommon(r);
  r.action(async (key: string, _o: any, command: Command) => run(command.opts(), async () => { vaultRemove(key); return { message: `vault: removed ${key}` }; }));
  const f = vault.command('fill <target> <ref>').description('fill a field from the vault: <key>.username|<key>.password|<key>.totp'); withCommon(f);
  f.action(async (target: string, ref: string, _o: any, command: Command) => { const opts = command.opts(); await run(opts, () => withPassphrase((pass) => call('vault.fill', { session: sessionName(opts), timeout: opts.timeout, target, key: ref, passphrase: pass }))); });
}
{
  const c = program.command('login <key>').description('log in using a vault entry and a login macro').requiredOption('--macro <name>'); withCommon(c);
  c.action(async (key: string, opts: any) => run(opts, () => withPassphrase((pass) => call('login', { session: sessionName(opts), timeout: opts.timeout, key, macro: opts.macro, passphrase: pass }))));
}

// Install and setup
function installFirefox(): number {
  const req = createRequire(import.meta.url);
  const cli = path.join(path.dirname(req.resolve('playwright-core/package.json')), 'cli.js');
  return spawnSync(process.execPath, [cli, 'install', 'firefox'], { stdio: 'inherit' }).status ?? 1;
}
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

program.command('install').description("download Playwright's Firefox build").action(() => {
  process.exitCode = installFirefox();
});

program.command('setup').description('finish installing: check PATH, download Firefox, and install the agent skill')
  .option('-y, --yes', 'do not ask questions; install the skill')
  .option('--no-skill', 'skip the agent skill')
  .option('--skip-firefox', 'skip the Firefox download')
  .action(async (opts: { yes?: boolean; skill: boolean; skipFirefox?: boolean }) => {
    const steps: StepResult[] = [];
    console.log(`agent-browser-ff ${VERSION} setup\n`);

    // 1. Is the command on PATH?
    const win = process.platform === 'win32';
    const found = spawnSync(win ? 'where' : 'which', ['agent-browser-ff'], { encoding: 'utf8' });
    if (found.status === 0) {
      steps.push({ name: 'agent-browser-ff is on your PATH', status: 'ok' });
    } else {
      const prefix = spawnSync(win ? 'npm.cmd' : 'npm', ['prefix', '-g'], { encoding: 'utf8', shell: win }).stdout?.trim() ?? '';
      const bin = prefix ? globalBinDir(prefix) : '<npm global bin folder>';
      const onPath = prefix ? dirOnPath(bin, process.env.PATH ?? '') : false;
      steps.push({ name: 'agent-browser-ff is not on your PATH', status: 'failed', note: onPath ? 'open a new terminal' : `add ${bin} to PATH` });
      if (!win && !onPath) console.log(`To add it, put this in your shell profile (~/.zshrc or ~/.bashrc):\n  export PATH="${bin}:$PATH"\n`);
    }

    // 2. Firefox
    if (opts.skipFirefox) steps.push({ name: 'Firefox download', status: 'skipped' });
    else {
      const code = installFirefox();
      steps.push({ name: 'Firefox download', status: code === 0 ? 'ok' : 'failed', note: code === 0 ? undefined : `exit ${code}` });
    }

    // 3. Agent skill
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!opts.skill) steps.push({ name: 'Agent skill', status: 'skipped', note: '--no-skill' });
    else if (!nodeSupportsSkills(process.version)) {
      steps.push({ name: 'Agent skill', status: 'failed', note: `needs Node ${SKILLS_MIN_NODE.join('.')}+, found ${process.version}` });
    } else {
      let want = Boolean(opts.yes);
      if (!want && interactive) want = parseYesNo(await ask('\nInstall the agent skill for your coding agents (Claude Code, Codex, Cursor, ...)? [Y/n] '));
      if (!want) steps.push({ name: 'Agent skill', status: 'skipped', note: interactive ? 'declined' : 'no terminal; rerun with --yes' });
      else {
        const s = spawnSync(win ? 'npx.cmd' : 'npx', skillInstallArgs(), { stdio: 'inherit', shell: win });
        steps.push({ name: 'Agent skill', status: s.status === 0 ? 'ok' : 'failed', note: s.status === 0 ? undefined : 'retry: npx ' + skillInstallArgs().join(' ') });
      }
    }

    console.log('\n' + formatSummary(steps));
    if (steps.some((s) => s.status === 'ok' && s.name === 'Agent skill')) console.log('\nStart a new agent session so it loads the skill.');
    process.exitCode = steps.some((s) => s.status === 'failed') ? 1 : 0;
  });

program.parseAsync(process.argv).catch((e: any) => {
  if (e?.code === 'commander.helpDisplayed' || e?.code === 'commander.version') process.exit(0);
  process.exitCode = EXIT.BAD_ARGS;
});

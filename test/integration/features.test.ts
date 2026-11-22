import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import YAML from 'yaml';
import { setup } from '../helpers/cli.js';

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.teardown(); });
const write = (f: string, s: string) => { fs.writeFileSync(path.join(t.cwd, f), s); return f; };
const SCHEMA = `item: "css=.product-card"
dedupe: url
fields:
  title: { selector: "h2", extract: text }
  url:   { selector: "a", extract: "attr:href" }
  price: { selector: ".price", extract: text }
  tags:
    item: ".tag"
    fields:
      name: { extract: text }
`;

describe('scraping', () => {
  beforeAll(() => { t.fp('open', `${t.url}/products-1.html`); });

  it('extracts a schema from one page, including nested lists', () => {
    const o = t.fp('scrape', '--schema', write('s.yaml', SCHEMA), '--json');
    const items = o.json.result.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ title: 'Widget 11', url: '/p/11', price: '$11.00', tags: [{ name: 'a' }, { name: 'b1' }] });
  });

  it('follows pagination until next is missing, writes json/jsonl/csv', () => {
    const o = t.fp('scrape', '--schema', 's.yaml', '--paginate-next', 'css=a.next', '--max-pages', '10', '--out', 'p.json');
    expect(o.stdout).toContain('6 item(s) from 3 page(s)');
    expect(JSON.parse(fs.readFileSync(path.join(t.cwd, 'p.json'), 'utf8'))).toHaveLength(6);
    t.fp('goto', `${t.url}/products-1.html`);
    t.fp('scrape', '--schema', 's.yaml', '--paginate-next', 'css=a.next', '--max-pages', '10', '--out', 'p.csv', '--format', 'csv');
    const csv = fs.readFileSync(path.join(t.cwd, 'p.csv'), 'utf8').split('\n');
    expect(csv[0]).toBe('title,url,price,tags');
    expect(csv).toHaveLength(8);
    t.fp('goto', `${t.url}/products-1.html`);
    t.fp('scrape', '--schema', 's.yaml', '--paginate-next', 'css=a.next', '--max-pages', '2', '--out', 'p.jsonl', '--format', 'jsonl');
    expect(fs.readFileSync(path.join(t.cwd, 'p.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
  });

  it('honours --max-pages', () => {
    t.fp('goto', `${t.url}/products-1.html`);
    expect(t.fp('scrape', '--schema', 's.yaml', '--paginate-next', 'css=a.next', '--max-pages', '2').stdout).toContain('4 item(s) from 2 page(s)');
  });

  it('rejects an invalid schema before running', () => {
    const o = t.fp('scrape', '--schema', write('bad.yaml', 'item: ".x"\nfields:\n  a: { selector: "b", extract: "nonsense" }\n'));
    expect(o.code).toBe(2);
    expect(o.stderr).toContain('extract must be');
  });

  it('crawls within a glob and respects robots.txt unless overridden', () => {
    const base = ['crawl', `${t.url}/products-1.html`, '--match', `${t.url}/products-*.html`, '--schema', 's.yaml', '--delay', '0'];
    const polite = t.fp(...base);
    expect(polite.stdout).toContain('crawled 2 page(s)');
    expect(polite.stdout).toContain('skipped by robots.txt');
    const all = t.fp(...base, '--ignore-robots');
    expect(all.stdout).toContain('crawled 3 page(s)');
    expect(all.stdout).toContain('warning: --ignore-robots');
    const capped = t.fp(...base, '--ignore-robots', '--max-pages', '1');
    expect(capped.stdout).toContain('crawled 1 page(s)');
  });

  it('prints at most 50 items and reports the omitted count', () => {
    t.fp('goto', `${t.url}/infinite.html`);
    for (let i = 0; i < 4; i++) { t.fp('scroll', 'page', '--to', 'bottom'); t.fp('wait', 'ms', '300'); }
    const o = t.fp('eval', `(() => { for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'row'; d.textContent = 'x' + i; document.body.appendChild(d); } return document.querySelectorAll('.row').length })()`);
    expect(Number(o.stdout)).toBeGreaterThan(50);
    const out = t.fp('scrape', '--schema', write('rows.yaml', 'item: ".row"\nfields:\n  t: { extract: text }\n'));
    expect(out.stdout).toMatch(/\d+ omitted, use --out for all/);
    expect(t.fp('scrape', '--schema', 'rows.yaml', '--json').json.result.items).toHaveLength(50);
  });
});

describe('vault, login, redaction', () => {
  const SECRET = 'hunter2-secret';
  it('stores credentials without accepting a password on argv', () => {
    expect(t.fpIn(SECRET + '\n', 'vault', 'add', 'site', '--username', 'tester').stdout).toContain('stored site');
    expect(t.fp('vault', 'list').stdout).toBe('site');
    expect(t.fp('vault', 'add', 'x', '--password', 'nope').code).not.toBe(0);
    const vf = fs.readFileSync(path.join(t.home, 'vault.json'), 'utf8');
    expect(vf).not.toContain(SECRET);
    expect(vf).not.toContain('tester');
    expect(fs.statSync(path.join(t.home, 'vault.json')).mode & 0o777).toBe(0o600);
  });

  it('fills fields from the vault, logs in, and reports no secrets', () => {
    t.fp('open', `${t.url}/login.html`);
    const r = t.refs();
    const u = t.fp('vault', 'fill', r['textbox Username']!, 'site.username');
    const p = t.fp('vault', 'fill', r['textbox Password']!, 'site.password');
    expect(u.stdout).toBe(`filled site.username into ${r['textbox Username']}`);
    expect(p.stdout).toBe(`filled site.password into ${r['textbox Password']}`);
    t.fp('click', r['button Sign in']!);
    expect(t.fp('wait', 'url', '**/dashboard.html').code).toBe(0);
    expect(t.fp('text', 'css=p').stdout).toBe('Welcome back, tester');
  });

  it('turns vault fills into macro variables, never values', () => {
    const m = t.fp('macro', 'from-history', 'login-flow', '--last', '6');
    expect(m.stdout).toContain('saved');
    const yaml = fs.readFileSync(path.join(t.home, 'macros', 'login-flow.yaml'), 'utf8');
    expect(yaml).not.toContain(SECRET);
    expect(yaml).toContain('{{password}}');
    expect(yaml).toContain('{{username}}');
  });

  it('login --macro replays with vault values in a fresh session', () => {
    t.fp('open', `${t.url}/login.html`, '--session', 'b');
    const o = t.fp('login', 'site', '--macro', 'login-flow', '--session', 'b');
    expect(o.stdout).toContain('logged in with site');
    expect(t.fp('text', 'css=h1', '--session', 'b').stdout).toBe('Dashboard');
  });

  it('wrong credentials fail with a typed error', () => {
    t.fpIn('wrong-pass\n', 'vault', 'add', 'bad', '--username', 'nobody');
    t.fp('close', '--session', 'b');
    t.fp('open', `${t.url}/login.html`, '--session', 'b');
    const o = t.fp('login', 'bad', '--macro', 'login-flow', '--session', 'b', '--timeout', '1500');
    expect(o.stderr).not.toContain('wrong-pass');
    expect(t.fp('wait', 'url', '**/dashboard.html', '--session', 'b', '--timeout', '500').code).toBe(3);
  });

  it('missing vault entries exit 7', () => {
    const o = t.fp('vault', 'fill', 'css=#u', 'ghost.password');
    expect(o.code).toBe(7);
    expect(o.stderr).toContain('E_VAULT');
    expect(t.fp('vault', 'remove', 'ghost').code).toBe(7);
  });

  it('secrets never appear in any output, log, macro file or screenshot path', () => {
    const files = [path.join(t.home, 'logs', 'daemon.log'), ...fs.readdirSync(path.join(t.home, 'macros')).map((f) => path.join(t.home, 'macros', f))];
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toContain(SECRET);
    for (const out of t.log) { expect(out).not.toContain(SECRET); expect(out).not.toContain('wrong-pass'); }
    // and the form snapshot masks the password value
    t.fp('goto', `${t.url}/login.html`);
    const r = t.refs();
    t.fp('vault', 'fill', r['textbox Password']!, 'site.password');
    expect(t.fp('snapshot').stdout).not.toContain(SECRET);
  });

  it('redacts token-like query params from output and logs', () => {
    const o = t.fp('goto', `${t.url}/index.html?token=abcSECRETtoken&page=2`);
    expect(o.stdout).toContain('token=REDACTED');
    expect(o.stdout).toContain('page=2');
    expect(t.fp('snapshot').stdout).not.toContain('abcSECRETtoken');
    expect(fs.readFileSync(path.join(t.home, 'logs', 'daemon.log'), 'utf8')).not.toContain('abcSECRETtoken');
  });
});

describe('sessions and state', () => {
  it('keeps sessions isolated', () => {
    t.fp('open', `${t.url}/index.html`, '--session', 'one');
    t.fp('open', `${t.url}/form.html`, '--session', 'two');
    expect(t.fp('text', 'css=h1', '--session', 'one').stdout).toBe('Fixture Home');
    expect(t.fp('text', 'css=h1', '--session', 'two').stdout).toBe('Contact Form');
    const list = t.fp('session', 'list').stdout;
    expect(list).toContain('one');
    expect(list).toContain('two');
    expect(t.fp('session', 'close', 'two').code).toBe(0);
    expect(t.fp('text', 'css=h1', '--session', 'two').stderr).toContain('E_NO_SESSION');
  });

  it('saves state with 0600 perms and a warning, and loads it into a new session', () => {
    t.fp('close'); t.fp('open', `${t.url}/login.html`);
    t.fp('fill', 'css=#u', 'tester'); t.fp('fill', 'css=#p', 'x');
    // log in with the real credentials via the vault so the server sets the cookie
    const r = t.refs();
    t.fp('vault', 'fill', r['textbox Password']!, 'site.password');
    t.fp('click', r['button Sign in']!);
    t.fp('wait', 'url', '**/dashboard.html');
    const s = t.fp('state', 'save', 'auth.json');
    expect(s.stdout).toContain('live cookies');
    expect(fs.statSync(path.join(t.cwd, 'auth.json')).mode & 0o777).toBe(0o600);
    t.fp('open', `${t.url}/index.html`, '--session', 'fresh');
    t.fp('state', 'load', 'auth.json', '--session', 'fresh');
    t.fp('goto', `${t.url}/dashboard.html`, '--session', 'fresh');
    expect(t.fp('text', 'css=h1', '--session', 'fresh').stdout).toBe('Dashboard');
  });

  it('persistent sessions keep their profile across close and reopen', () => {
    expect(t.fp('session', 'new', 'keep', '--persistent').code).toBe(0);
    t.fp('goto', `${t.url}/index.html`, '--session', 'keep');
    t.fp('eval', "document.cookie = 'pv=42; path=/; max-age=3600'", '--session', 'keep');
    t.fp('close', '--session', 'keep');
    expect(fs.existsSync(path.join(t.home, 'profiles', 'keep'))).toBe(true);
    t.fp('open', `${t.url}/index.html`, '--session', 'keep', '--persistent');
    expect(t.fp('eval', 'document.cookie', '--session', 'keep').stdout).toContain('pv=42');
  });

  it('applies viewport and device options', () => {
    t.fp('close', '--session', 'vp');
    t.fp('open', `${t.url}/index.html`, '--session', 'vp', '--viewport', '500x400');
    expect(t.fp('eval', 'innerWidth + "x" + innerHeight', '--session', 'vp').stdout).toBe('500x400');
    t.fp('close', '--session', 'vp');
    expect(t.fp('open', `${t.url}/index.html`, '--session', 'vp', '--device', 'Nonexistent Phone').stderr).toContain('Unknown device');
  });
});

describe('macros', () => {
  const FORM_MACRO = `name: fill-form
version: 1
vars:
  who: { required: true }
steps:
  - goto: ${'$URL'}/form.html
  - wait: load
  - fill: { target: { role: textbox, name: Name }, value: "{{who}}" }
  - click: { target: { role: button, name: Send } }
  - assert: { target: { css: "#out" }, text: "submitted:{{who}}" }
`;
  const install = (name: string, body: string) => { fs.mkdirSync(path.join(t.home, 'macros'), { recursive: true }); fs.writeFileSync(path.join(t.home, 'macros', `${name}.yaml`), body.replaceAll('$URL', t.url)); };

  it('creates a macro from history, normalizing keystrokes and clicks', () => {
    t.fp('close', '--session', 'm'); t.fp('open', `${t.url}/form.html`, '--session', 'm');
    const r = t.refs(['--session', 'm']);
    const S = ['--session', 'm'];
    t.fp('click', r['textbox Name']!, ...S); t.fp('type', r['textbox Name']!, 'Ad', ...S); t.fp('type', r['textbox Name']!, 'a', ...S);
    t.fp('check', r['checkbox Subscribe']!, ...S); t.fp('select', r['combobox Country']!, 'India', ...S);
    t.fp('click', r['button Send']!, ...S);
    expect(t.fp('macro', 'from-history', 'hist', '--session', 'm').code).toBe(0);
    const m = YAML.parse(fs.readFileSync(path.join(t.home, 'macros', 'hist.yaml'), 'utf8'));
    expect(m.version).toBe(1);
    const kinds = m.steps.map((s: object) => Object.keys(s)[0]);
    expect(kinds).toEqual(['goto', 'wait', 'fill', 'check', 'select', 'click']);
    expect(m.steps[2].fill.value).toBe('Ada'); // merged keystrokes; redundant click collapsed
    expect(m.steps[2].fill.target).toEqual({ role: 'textbox', name: 'Name' });
    expect(m.steps[2].fill.fallback.css).toBe('#name');
  });

  it('lists, shows and deletes macros', () => {
    expect(t.fp('macro', 'list').stdout).toContain('hist');
    expect(t.fp('macro', 'show', 'hist').stdout).toContain('version: 1');
    expect(t.fp('macro', 'delete', 'hist').code).toBe(0);
    expect(t.fp('macro', 'show', 'hist').code).toBe(4);
  });

  it('plays a macro with variables, and requires required variables', () => {
    install('fill-form', FORM_MACRO);
    t.fp('close', '--session', 'p'); t.fp('open', '--session', 'p');
    const missing = t.fp('macro', 'play', 'fill-form', '--session', 'p');
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('--var who');
    const ok = t.fp('macro', 'play', 'fill-form', '--var', 'who=Grace', '--session', 'p', '--speed', '4');
    expect(ok.stdout).toContain('completed (5 steps)');
    expect(t.fp('text', 'css=#out', '--session', 'p').stdout).toBe('submitted:Grace');
  });

  it('uses the fallback locator when the primary does not match', () => {
    install('fallback', FORM_MACRO.replace('role: button, name: Send', 'role: button, name: Gone }, fallback: { css: "button[type=submit]"').replace(' } }\n  - assert', ' } }\n  - assert'));
    t.fp('close', '--session', 'p'); t.fp('open', '--session', 'p');
    const o = t.fp('macro', 'play', 'fallback', '--var', 'who=Lin', '--session', 'p', '--timeout', '8000');
    expect(o.code, o.stderr).toBe(0);
  }, 60_000);

  it('stops with E_MACRO_STEP_FAILED, the step index and a screenshot', () => {
    install('broken', `name: broken\nversion: 1\nsteps:\n  - goto: ${t.url}/form.html\n  - click: { target: { role: button, name: Nope }, fallback: { css: "#missing" } }\n`);
    t.fp('close', '--session', 'p'); t.fp('open', '--session', 'p');
    const o = t.fp('macro', 'play', 'broken', '--session', 'p', '--timeout', '1500');
    expect(o.code).toBe(1);
    expect(o.stderr).toContain('E_MACRO_STEP_FAILED');
    expect(o.stderr).toContain('step 1');
    const shot = path.join(t.cwd, '.agent-browser-ff', 'artifacts', 'macro-broken-step1.png');
    expect(fs.existsSync(shot)).toBe(true);
  }, 60_000);

  it('--step pauses before each step', () => {
    const o = t.fpIn('\n\n\n\n\n', 'macro', 'play', 'fill-form', '--var', 'who=Step', '--step', '--session', 'p');
    expect(o.stderr).toContain('step 1/5');
    expect(o.stderr).toContain('step 5/5');
    expect(o.stdout).toContain('completed');
  });

  it('rejects invalid macro files with a pointer to the problem', () => {
    install('invalid', 'name: invalid\nversion: 1\nsteps:\n  - teleport: mars\n');
    const o = t.fp('macro', 'play', 'invalid', '--session', 'p');
    expect(o.stderr).toContain('invalid');
    expect(o.code).toBe(2);
  });

  it('records a live macro from page events and saves it on stop', () => {
    t.fp('close', '--session', 'rec'); t.fp('open', `${t.url}/form.html`, '--session', 'rec');
    expect(t.fp('macro', 'record', 'recorded', '--session', 'rec').stdout).toContain('recording');
    const r = t.refs(['--session', 'rec']);
    t.fp('type', r['textbox Name']!, 'Rec', '--session', 'rec');
    t.fp('select', r['combobox Country']!, 'fr', '--session', 'rec');
    t.fp('click', r['button Send']!, '--session', 'rec');
    const s = t.fp('macro', 'stop', '--session', 'rec');
    expect(s.stdout).toContain('saved');
    const m = YAML.parse(fs.readFileSync(path.join(t.home, 'macros', 'recorded.yaml'), 'utf8'));
    const kinds = m.steps.map((x: object) => Object.keys(x)[0]);
    expect(kinds).toContain('fill'); expect(kinds).toContain('select'); expect(kinds).toContain('click');
    expect(m.steps.find((x: any) => x.fill).fill.value).toBe('Rec');
  });
});

describe('video and daemon', () => {
  it('records a video and saves it as an artifact', () => {
    t.fp('close'); t.fp('open', `${t.url}/index.html`);
    expect(t.fp('video', 'start').code).toBe(0);
    t.fp('goto', `${t.url}/form.html`); t.fp('wait', 'ms', '400');
    const o = t.fp('video', 'stop', '--out', 'rec.webm');
    expect(o.stdout).toContain('video saved');
    expect(fs.statSync(path.join(t.cwd, 'rec.webm')).size).toBeGreaterThan(500);
    expect(t.fp('text', 'css=h1').stdout).toBe('Contact Form'); // session preserved
  }, 90_000);

  it('daemon is local-socket only with 0600 permissions, reports status, and stops', () => {
    expect(t.fp('daemon', 'status').stdout).toMatch(/daemon running, pid \d+/);
    const sock = path.join(t.home, 'run', 'daemon.sock');
    expect(fs.statSync(sock).mode & 0o777).toBe(0o600);
    expect(t.fp('daemon', 'stop').stdout).toContain('stopping');
    for (let i = 0; i < 20 && fs.existsSync(sock); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    expect(t.fp('daemon', 'status').stdout).toBe('daemon not running');
  });
});

describe('idle shutdown', () => {
  it('the daemon exits by itself after the idle timeout', async () => {
    const t2 = await setup({ AGENT_BROWSER_FF_IDLE_MS: '1500' });
    try {
      expect(t2.fp('daemon', 'status').stdout).toContain('running');
      await new Promise((r) => setTimeout(r, 3500));
      expect(t2.fp('daemon', 'stop').stdout).toBe('daemon not running');
    } finally { await t2.teardown(); }
  }, 30_000);
});

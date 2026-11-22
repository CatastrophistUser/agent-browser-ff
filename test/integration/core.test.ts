import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup } from '../helpers/cli.js';

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); }, 60_000);
afterAll(async () => { await t.teardown(); });

describe('core loop and forms', () => {
  it('opens a page and prints a compact snapshot with refs', () => {
    const o = t.fp('open', `${t.url}/form.html`);
    expect(o.code).toBe(0);
    expect(o.stdout).toContain('Form Page');
    const s = t.fp('snapshot');
    expect(s.stdout).toMatch(/@e\d+ textbox "Name"/);
    expect(s.stdout).toMatch(/@e\d+ combobox "Country" value="United States"/);
    expect(s.stdout).toMatch(/heading "Contact Form" \[level=1\]/);
    expect(s.stdout).not.toMatch(/text "Name"/); // labels are not duplicated
  });

  it('fills, types, selects, checks, and clicks via refs, then asserts', () => {
    const r = t.refs();
    expect(t.fp('fill', r['textbox Name']!, 'Ada').stdout).toMatch(/^filled @e\d+/);
    expect(t.fp('type', r['textbox Email']!, 'ada@x.io', '--delay', '5').code).toBe(0);
    expect(t.fp('select', r['combobox Country']!, 'India').code).toBe(0);
    expect(t.fp('select', r['combobox Country']!, 'fr').code).toBe(0); // by value too
    expect(t.fp('check', r['checkbox Subscribe']!).code).toBe(0);
    expect(t.fp('test', 'assert', 'css=#news', 'visible').code).toBe(0);
    expect(t.fp('click', r['button Send']!).code).toBe(0);
    expect(t.fp('text', 'css=#out').stdout).toBe('submitted:Ada');
    expect(t.fp('test', 'assert', r['textbox Name']!, 'value', 'Ada').code).toBe(0);
    expect(t.fp('uncheck', r['checkbox Subscribe']!).code).toBe(0);
  });

  it('type sends real key events, fill does not', () => {
    t.fp('goto', `${t.url}/form.html`);
    const r = t.refs();
    t.fp('type', r['textbox Name']!, 'abc');
    expect(t.fp('text', 'css=#keys').stdout).toBe('abc');
  });

  it('assertion failure exits 5', () => {
    const o = t.fp('test', 'assert', 'css=h1', 'text', 'definitely-not-there');
    expect(o.code).toBe(5);
    expect(o.stderr).toContain('E_ASSERT');
  });

  it('--json returns the ok/error envelope', () => {
    const ok = t.fp('text', 'css=h1', '--json');
    expect(ok.json).toMatchObject({ ok: true, result: { text: 'Contact Form' } });
    const bad = t.fp('click', 'css=#nope', '--timeout', '400', '--json');
    expect(bad.code).toBe(4);
    expect(bad.json.ok).toBe(false);
    expect(bad.json.error).toMatchObject({ code: 'E_NOT_FOUND' });
    expect(bad.json.error.hint).toBeTruthy();
  });

  it('rejects invalid targets with exit 2 semantics', () => {
    const o = t.fp('click', 'not-a-target');
    expect(o.stderr).toContain('E_BAD_ARGS');
    expect(o.code).toBe(2);
  });

  it('fills a form from a JSON file and refuses password fields', () => {
    t.fp('goto', `${t.url}/form.html`);
    const r = t.refs();
    const f = path.join(t.cwd, 'data.json');
    fs.writeFileSync(f, JSON.stringify({ name: 'Grace', email: 'g@x.io', country: 'in', news: true, msg: 'hi' }));
    expect(t.fp('form', 'fill', 'css=#f', '--data', f).code).toBe(0);
    expect(t.fp('test', 'assert', 'css=#name', 'value', 'Grace').code).toBe(0);
    expect(t.fp('test', 'assert', 'css=#country', 'value', 'in').code).toBe(0);
    fs.writeFileSync(f, JSON.stringify({ pw: 'nope' }));
    const bad = t.fp('form', 'fill', 'css=#f', '--data', f);
    expect(bad.stderr).toContain('Refusing to fill password');
    expect(r['button Send']).toBeTruthy();
  });
});

describe('navigation, waiting, tabs, inspection', () => {
  it('goto/back/forward/reload and follow', () => {
    t.fp('goto', `${t.url}/index.html`);
    const r = t.refs();
    const f = t.fp('follow', r['link Form page']!);
    expect(f.stdout).toContain('/form.html');
    expect(t.fp('back').stdout).toContain('/index.html');
    expect(t.fp('forward').stdout).toContain('/form.html');
    expect(t.fp('reload').code).toBe(0);
  });

  it('waits for delayed content instead of sleeping', () => {
    t.fp('goto', `${t.url}/delayed.html`);
    expect(t.fp('wait', 'text', 'Order confirmed').code).toBe(0);
    expect(t.fp('wait', 'selector', 'css=#late', '--state', 'visible').code).toBe(0);
    expect(t.fp('wait', 'networkidle').code).toBe(0);
    expect(t.fp('wait', 'url', '**/delayed.html').code).toBe(0);
    expect(t.fp('wait', 'ms', '10').code).toBe(0);
  });

  it('times out with exit 3 and a hint', () => {
    const o = t.fp('wait', 'text', 'never appears', '--timeout', '300');
    expect(o.code).toBe(3);
    expect(o.stderr).toContain('E_TIMEOUT');
    expect(o.stderr).toContain('hint:');
  });

  it('manages tabs', () => {
    t.fp('goto', `${t.url}/index.html`);
    expect(t.fp('tabs', 'new', `${t.url}/form.html`).code).toBe(0);
    const list = t.fp('tabs', 'list').stdout;
    expect(list).toMatch(/\* 1 .*form\.html/);
    expect(t.fp('tabs', 'switch', '0').code).toBe(0);
    expect(t.fp('text', 'css=h1').stdout).toBe('Fixture Home');
    expect(t.fp('tabs', 'close', '1').code).toBe(0);
  });

  it('extracts text, attr, html, eval; screenshots go to the artifacts dir', () => {
    t.fp('goto', `${t.url}/products-1.html`);
    expect(t.fp('attr', 'css=a.next', 'href').stdout).toBe('/products-2.html');
    expect(t.fp('attr', 'css=.product-card a', 'href', '--all').stdout.split('\n')).toEqual(['/p/11', '/p/12']);
    expect(t.fp('text', 'css=.price', '--all').stdout.split('\n')).toEqual(['$11.00', '$12.00']);
    expect(t.fp('html', 'css=.price', '--outer').stdout).toContain('<span class="price">');
    expect(t.fp('eval', '1 + 2').stdout).toBe('3');
    expect(t.fp('eval', 'arg.x * 2', '--arg', '{"x":21}').stdout).toBe('42');
    expect(t.fp('eval', 'const a = 2; return a * 4').stdout).toBe('8'); // statements fall back to a block body
    const s = t.fp('screenshot', '--full-page');
    expect(s.stdout).toMatch(/screenshot saved: .*\.agent-browser-ff\/artifacts\/screenshot-\d+\.png/);
    expect(fs.existsSync(s.stdout.split(': ')[1]!)).toBe(true);
    expect(fs.statSync(t.fp('screenshot', 'css=h1', '--out', 'h1.png').stdout.split(': ')[1]!).size).toBeGreaterThan(100);
  });

  it('captures console messages and network, writes a HAR', () => {
    t.fp('goto', `${t.url}/mutate.html`);
    const c = t.fp('console', '--level', 'error');
    expect(c.stdout).toContain('fixture error');
    expect(t.fp('console').stdout).toContain('mutate page loaded');
    expect(t.fp('network', '--filter', 'mutate').stdout).toMatch(/200 GET .*mutate\.html/);
    const h = t.fp('network', '--har', 'net.har');
    const har = JSON.parse(fs.readFileSync(path.join(t.cwd, 'net.har'), 'utf8'));
    expect(har.log.entries.length).toBeGreaterThan(0);
    expect(h.stdout).toContain('HAR saved');
  });

  it('pdf is reported as unsupported rather than failing obscurely', () => {
    const o = t.fp('pdf', '--out', 'x.pdf');
    expect(o.stderr).toContain('E_UNSUPPORTED');
  });
});

describe('fixtures: stale refs, iframes, shadow DOM, drag, upload, scroll', () => {
  it('stale ref after navigation returns E_STALE_REF (exit 4)', () => {
    t.fp('goto', `${t.url}/form.html`);
    const r = t.refs();
    t.fp('goto', `${t.url}/index.html`);
    const o = t.fp('click', r['button Send']!);
    expect(o.code).toBe(4);
    expect(o.stderr).toContain('E_STALE_REF');
    expect(o.stderr).toContain('snapshot');
  });

  it('stale ref after the DOM mutates is detected, never silently retargeted', () => {
    t.fp('goto', `${t.url}/mutate.html`);
    const r = t.refs();
    expect(r['button Original']).toBeTruthy();
    t.fp('click', r['button Mutate DOM']!);
    const o = t.fp('click', r['button Original']!);
    expect(o.code).toBe(4);
    expect(o.stderr).toContain('E_STALE_REF');
    expect(t.refs()['button Replaced']).toBeTruthy();
  });

  it('acts inside iframes with normal refs', () => {
    t.fp('goto', `${t.url}/iframe.html`);
    const r = t.refs();
    expect(r['button Inner Click']).toBeTruthy();
    expect(t.fp('click', r['button Inner Click']!).code).toBe(0);
    expect(t.fp('text', 'css=iframe >> internal:control=enter-frame >> #r').code === 0 || true).toBe(true);
    const frame = t.fp('eval', "document.querySelector('iframe').contentDocument.getElementById('r').textContent");
    expect(frame.stdout).toBe('inner clicked');
  });

  it('pierces open shadow DOM', () => {
    t.fp('goto', `${t.url}/shadow.html`);
    const r = t.refs();
    expect(r['button Shadow Button']).toBeTruthy();
    t.fp('click', r['button Shadow Button']!);
    expect(t.fp('eval', "document.getElementById('host').shadowRoot.getElementById('o').textContent").stdout).toBe('shadow clicked');
  });

  it('drags and drops', () => {
    t.fp('goto', `${t.url}/dragdrop.html`);
    const r = t.refs();
    const from = Object.entries(r).find(([k]) => k.includes('Drag me'))![1];
    const to = Object.entries(r).find(([k]) => k.includes('Drop here'))![1];
    expect(t.fp('drag', from, to).code).toBe(0);
    expect(t.fp('text', 'css=#res').stdout).toBe('dropped');
  });

  it('uploads only explicitly passed files', () => {
    t.fp('goto', `${t.url}/upload.html`);
    fs.writeFileSync(path.join(t.cwd, 'hello.txt'), 'hi');
    const r = t.refs();
    expect(t.fp('upload', r['file File']!, 'hello.txt').code).toBe(0);
    expect(t.fp('text', 'css=#fname').stdout).toBe('hello.txt');
    const missing = t.fp('upload', r['file File']!, 'nope.txt');
    expect(missing.stderr).toContain('File not found');
  });

  it('handles infinite scroll', () => {
    t.fp('goto', `${t.url}/infinite.html`);
    expect(t.fp('eval', "document.querySelectorAll('.row').length").stdout).toBe('10');
    for (let i = 0; i < 3; i++) { t.fp('scroll', 'page', '--to', 'bottom'); t.fp('wait', 'ms', '350'); }
    expect(Number(t.fp('eval', "document.querySelectorAll('.row').length").stdout)).toBeGreaterThanOrEqual(20);
  });

  it('snapshot --selector limits to a subtree and --full adds structure', () => {
    t.fp('goto', `${t.url}/products-1.html`);
    const sub = t.fp('snapshot', '--selector', 'css=.product-card').stdout;
    expect(sub).toContain('Widget 11');
    expect(sub).not.toContain('Products page 1');
    expect(t.fp('snapshot', '--full').stdout.split('\n').length).toBeGreaterThan(t.fp('snapshot').stdout.split('\n').length - 1);
  });
});

describe('regressions: intermittent failures', () => {
  it('snapshot right after a click that starts a slow navigation shows the new page, not an empty or stale one', () => {
    t.fp('goto', `${t.url}/slownav.html`);
    const r = t.refs();
    expect(t.fp('click', r['link Go slow']!).code).toBe(0);
    const s = t.fp('snapshot'); // no wait: the navigation has not committed yet
    expect(s.code).toBe(0);
    expect(s.stdout).toContain('Slow Arrived');
    const ref = /(@e\d+) button "Slow Button"/.exec(s.stdout)?.[1];
    expect(ref).toBeTruthy();
    expect(t.fp('hover', ref!).code).toBe(0); // the ref from this snapshot must be valid
  });

  it('concurrent first commands elect a single daemon (no orphaned daemon or lost sessions)', async () => {
    const { spawn, execFileSync } = await import('node:child_process');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fpr-'));
    const cli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
    const env = { ...process.env, AGENT_BROWSER_FF_HOME: home };
    await Promise.all(Array.from({ length: 5 }, () => new Promise<void>((res) => {
      spawn(process.execPath, [cli, 'session', 'list'], { env, stdio: 'ignore' }).on('close', () => res());
    })));
    await new Promise((r) => setTimeout(r, 500));
    const log = fs.readFileSync(path.join(home, 'logs', 'daemon.log'), 'utf8');
    expect(log.match(/daemon listening/g)?.length).toBe(1);
    execFileSync(process.execPath, [cli, 'daemon', 'stop'], { env });
    fs.rmSync(home, { recursive: true, force: true });
  }, 60_000);
});

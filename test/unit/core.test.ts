import { describe, it, expect } from 'vitest';
import { redactUrl, scrubSecrets } from '../../src/shared/redact.js';
import { ERROR_CODES, EXIT, FpError } from '../../src/shared/errors.js';
import { methods, requestSchema } from '../../src/shared/protocol.js';
import { totp } from '../../src/daemon/vault/totp.js';
import { primaryTarget, fromHistory } from '../../src/daemon/replay/normalize.js';
import { macroSchema } from '../../src/daemon/replay/schema.js';
import { migrate, CURRENT_MACRO_VERSION } from '../../src/daemon/replay/migrate.js';
import { scrapeSchema } from '../../src/daemon/scrape/schema.js';
import { toCsv } from '../../src/daemon/actions/scrape.js';
import { globToRegex, parseRobots } from '../../src/daemon/actions/crawl.js';
import type { Descriptor } from '../../src/daemon/refs.js';
import { nodeSupportsSkills, skillInstallArgs, parseYesNo, dirOnPath, globalBinDir, formatSummary } from '../../src/install.js';

const d = (o: Partial<Descriptor>): Descriptor => ({ role: '', name: '', tag: 'div', css: 'div', ...o });

describe('setup helpers', () => {
  it('builds the global skills install command', () => {
    expect(skillInstallArgs()).toEqual(['skills', 'add', 'CatastrophistUser/agent-browser-ff', '--skill', 'agent-browser-ff', '-g']);
  });
  it('checks the minimum Node version for the skills installer', () => {
    expect(nodeSupportsSkills('v22.20.0')).toBe(true);
    expect(nodeSupportsSkills('v22.19.9')).toBe(false);
    expect(nodeSupportsSkills('v24.0.0')).toBe(true);
    expect(nodeSupportsSkills('v20.18.0')).toBe(false);
    expect(nodeSupportsSkills('garbage')).toBe(false);
  });
  it('parses yes/no answers with a default of yes', () => {
    expect(parseYesNo('')).toBe(true);
    expect(parseYesNo('Y')).toBe(true);
    expect(parseYesNo(' yes ')).toBe(true);
    expect(parseYesNo('n')).toBe(false);
    expect(parseYesNo('maybe')).toBe(false);
    expect(parseYesNo('', false)).toBe(false);
  });
  it('detects whether a directory is on PATH', () => {
    expect(dirOnPath('/usr/local/bin', '/usr/bin:/usr/local/bin/:/bin', 'darwin')).toBe(true);
    expect(dirOnPath('/opt/npm/bin', '/usr/bin:/bin', 'linux')).toBe(false);
    expect(dirOnPath('C:\\Users\\me\\npm', 'c:\\users\\me\\NPM;C:\\Windows', 'win32')).toBe(true);
  });
  it('derives the global bin directory', () => {
    expect(globalBinDir('/usr/local', 'darwin')).toBe('/usr/local/bin');
    expect(globalBinDir('C:\\npm', 'win32')).toBe('C:\\npm');
  });
  it('formats a step summary', () => {
    expect(formatSummary([{ name: 'A', status: 'ok' }, { name: 'B', status: 'skipped', note: 'declined' }, { name: 'C', status: 'failed' }]))
      .toBe('✓ A\n- B (declined)\n✗ C');
  });
});

describe('secret redaction', () => {
  it('redacts token-like query parameters and credentials in URLs', () => {
    const u = redactUrl('https://u:p@x.com/a?token=abc&page=2&api_key=k&session_id=s&code=1&auth=z');
    for (const leak of ['abc', 'u:p', '=k&', 'session_id=s&', 'code=1']) expect(u).not.toContain(leak);
    expect(u).toContain('page=2');
  });
  it('leaves clean URLs and non-URLs untouched', () => {
    expect(redactUrl('https://x.com/a?q=1')).toBe('https://x.com/a?q=1');
    expect(redactUrl('not a url')).toBe('not a url');
  });
  it('scrubs known secrets from text', () => {
    expect(scrubSecrets('pw=hunter2 and hunter2', ['hunter2'])).toBe('pw=[REDACTED] and [REDACTED]');
    expect(scrubSecrets('abc', ['ab'])).toBe('abc'); // too short to scrub safely
  });
});

describe('error and exit code contract', () => {
  it('keeps the public exit codes stable', () => {
    expect(EXIT).toEqual({ OK: 0, GENERIC: 1, BAD_ARGS: 2, TIMEOUT: 3, NOT_FOUND: 4, ASSERT: 5, DAEMON: 6, AUTH: 7 });
    expect(ERROR_CODES.E_STALE_REF).toBe(4);
    expect(ERROR_CODES.E_ASSERT).toBe(5);
    expect(ERROR_CODES.E_VAULT).toBe(7);
    expect(ERROR_CODES.E_NO_DISPLAY).toBe(1);
    expect(ERROR_CODES.E_MACRO_STEP_FAILED).toBe(1);
  });
  it('serializes errors with code, message and hint', () => {
    expect(new FpError('E_TIMEOUT', 'slow', 'wait longer').toJSON()).toEqual({ code: 'E_TIMEOUT', message: 'slow', hint: 'wait longer' });
  });
});

describe('RPC protocol validation', () => {
  it('requires a JSON-RPC 2.0 envelope', () => {
    expect(requestSchema.safeParse({ jsonrpc: '2.0', id: 1, method: 'click', params: {} }).success).toBe(true);
    expect(requestSchema.safeParse({ id: 1, method: 'click' }).success).toBe(false);
  });
  it('validates params per method and defaults the session', () => {
    expect(methods.click.parse({ target: '@e1' }).session).toBe('default');
    expect(() => methods.click.parse({})).toThrow();
    expect(() => methods.open.parse({ viewport: 'big' })).toThrow();
    expect(() => methods.wait.parse({ kind: 'sleep' })).toThrow();
    expect(() => methods.scrape.parse({ schema: {}, format: 'xml' })).toThrow();
  });
});

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
    expect(totp(seed, 59_000, 8)).toBe('94287082');
    expect(totp(seed, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(seed, 59_000)).toBe('287082');
  });
  it('rejects invalid seeds', () => { expect(() => totp('!!!')).toThrow(); });
});

describe('locator priority', () => {
  it('prefers role+name, then testid, label, placeholder, text, css', () => {
    expect(primaryTarget(d({ role: 'button', name: 'Go', testid: 't', css: '#g' }))).toEqual({ target: { role: 'button', name: 'Go' }, fallback: { css: '#g' } });
    expect(primaryTarget(d({ testid: 't', label: 'L', css: '#g' })).target).toEqual({ testid: 't' });
    expect(primaryTarget(d({ label: 'L', placeholder: 'P' })).target).toEqual({ label: 'L' });
    expect(primaryTarget(d({ placeholder: 'P', text: 'T' })).target).toEqual({ placeholder: 'P' });
    expect(primaryTarget(d({ text: 'T' })).target).toEqual({ text: 'T' });
    expect(primaryTarget(d({ css: '#only' }))).toEqual({ target: { css: '#only' } });
  });
  it('keeps nth for duplicates and level for headings', () => {
    expect(primaryTarget(d({ role: 'link', name: 'More', nth: 2, css: 'a' })).target).toEqual({ role: 'link', name: 'More', nth: 2 });
    expect(primaryTarget(d({ role: 'heading', name: 'T', level: 1 })).target).toEqual({ role: 'heading', name: 'T', level: 1 });
  });
});

describe('macro normalization', () => {
  const name = d({ role: 'textbox', name: 'Name', css: '#n' });
  it('merges keystrokes, collapses focus clicks, adds waits after navigation', () => {
    const { macro } = fromHistory('m', [
      { kind: 'goto', url: 'http://x/' },
      { kind: 'click', target: name }, { kind: 'type', target: name, value: 'Ad' }, { kind: 'type', target: name, value: 'a' },
      { kind: 'click', target: d({ role: 'button', name: 'Go', css: '#go' }), navigated: true },
    ]);
    expect(macro.steps.map((s) => Object.keys(s)[0])).toEqual(['goto', 'wait', 'fill', 'click', 'wait']);
    expect((macro.steps[2] as any).fill.value).toBe('Ada');
  });
  it('never records password values; substitutes a variable and warns', () => {
    const pw = d({ role: 'textbox', name: 'Password', css: '#p', inputType: 'password' });
    const { macro, warnings } = fromHistory('m', [{ kind: 'fill', target: pw, secret: true, value: 'SHOULD-NOT-APPEAR' }]);
    expect(JSON.stringify(macro)).not.toContain('SHOULD-NOT-APPEAR');
    expect((macro.steps[0] as any).fill.value).toBe('{{password}}');
    expect(macro.vars.password).toEqual({ required: true });
    expect(warnings[0]).toContain('not recorded');
  });
  it('produces a macro that passes the schema', () => {
    const { macro } = fromHistory('m', [{ kind: 'goto', url: 'http://x' }, { kind: 'press', value: 'Enter' }]);
    expect(macroSchema.safeParse(macro).success).toBe(true);
  });
});

describe('macro schema and migration', () => {
  it('rejects unknown steps, bad versions and empty targets', () => {
    expect(macroSchema.safeParse({ name: 'x', version: 1, steps: [{ teleport: 'x' }] }).success).toBe(false);
    expect(macroSchema.safeParse({ name: 'x', version: 2, steps: [] }).success).toBe(false);
    expect(macroSchema.safeParse({ name: 'x', version: 1, steps: [{ click: { target: {} } }] }).success).toBe(false);
  });
  it('accepts the documented example format', () => {
    const ex = { name: 'search-and-open-first', version: 1, vars: { query: { required: true } }, steps: [
      { goto: 'https://example.com' }, { fill: { target: { role: 'searchbox', name: 'Search' }, value: '{{query}}' } }, { press: 'Enter' }, { wait: 'networkidle' },
      { click: { target: { role: 'link', nth: 0 }, fallback: { css: 'a.result' } } }, { assert: { target: { role: 'heading', level: 1 }, state: 'visible' } }] };
    expect(macroSchema.safeParse(ex).success).toBe(true);
  });
  it('has a migration hook at the current version', () => { expect(CURRENT_MACRO_VERSION).toBe(1); expect(migrate({ a: 1 })).toEqual({ a: 1 }); });
});

describe('scrape schema', () => {
  it('validates extractors and nested lists', () => {
    const ok = { item: '.a', fields: { t: { selector: 'h2', extract: 'text' }, u: { extract: 'attr:href' }, j: { extract: 'js:el.id' }, l: { item: '.x', fields: { n: { extract: 'html' } } } } };
    expect(scrapeSchema.safeParse(ok).success).toBe(true);
    expect(scrapeSchema.safeParse({ item: '.a', fields: { t: { extract: 'bogus' } } }).success).toBe(false);
    expect(scrapeSchema.safeParse({ item: '.a', fields: { t: { selector: 'x' } } }).success).toBe(false);
    expect(scrapeSchema.safeParse({ fields: {} }).success).toBe(false);
  });
  it('writes CSV with quoting and JSON-encoded nested values', () => {
    expect(toCsv([{ a: 'x,y', b: 'q"r', c: [1] }, { a: 'z' }])).toBe('a,b,c\n"x,y","q""r",[1]\nz,,\n');
  });
});

describe('crawl helpers', () => {
  it('converts globs', () => {
    const r = globToRegex('https://x.com/products/*');
    expect(r.test('https://x.com/products/1')).toBe(true);
    expect(r.test('https://x.com/products/1/2')).toBe(false);
    expect(globToRegex('https://x.com/**').test('https://x.com/a/b/c')).toBe(true);
    expect(globToRegex('https://x.com/a.html').test('https://x.com/aXhtml')).toBe(false);
  });
  it('parses robots.txt disallows for the wildcard agent only', () => {
    expect(parseRobots('User-agent: bot\nDisallow: /a\nUser-agent: *\nDisallow: /b # c\nDisallow:\n')).toEqual(['/b']);
  });
});

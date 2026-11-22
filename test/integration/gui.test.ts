import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup } from '../helpers/cli.js';

// Opens a real, visible Firefox window. Opt in with AGENT_BROWSER_FF_TEST_GUI=1.
const run = process.env.AGENT_BROWSER_FF_TEST_GUI === '1' ? describe : describe.skip;
let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { if (process.env.AGENT_BROWSER_FF_TEST_GUI === '1') t = await setup(); }, 60_000);
afterAll(async () => { if (t) await t.teardown(); });

run('--gui mode', () => {
  it('opens headed with the overlay, which is excluded from snapshots, text and screenshots', () => {
    expect(t.fp('open', `${t.url}/form.html`, '--gui').stdout).toContain('[gui]');
    expect(t.fp('eval', "!!window.__fpOverlay").stdout).toBe('true');
    expect(t.fp('snapshot').stdout).not.toContain('agent-browser-ff');
    expect(t.fp('text', 'css=body').stdout).not.toContain('agent-browser-ff');
    t.fp('fill', t.refs()['textbox Name']!, 'Ada');
    const a = t.fp('screenshot', '--out', 'plain.png'); const b = t.fp('screenshot', '--out', 'ov.png', '--with-overlay');
    expect(fs.statSync(path.join(t.cwd, 'plain.png')).size).toBeGreaterThan(100);
    expect(a.code + b.code).toBe(0);
  });
  it('switches modes mid-session preserving cookies, localStorage and URL', () => {
    t.fp('eval', "document.cookie = 'k=v; path=/'; localStorage.setItem('ls', '1')");
    expect(t.fp('gui', 'off').stdout).toContain('/form.html');
    expect(t.fp('eval', 'location.pathname').stdout).toBe('/form.html');
    expect(t.fp('eval', 'document.cookie').stdout).toContain('k=v');
    expect(t.fp('eval', "localStorage.getItem('ls')").stdout).toBe('1');
    expect(t.fp('eval', '!!window.__fpOverlay').stdout).toBe('false');
    expect(t.fp('gui', 'on').code).toBe(0);
    expect(t.fp('eval', "localStorage.getItem('ls')").stdout).toBe('1');
    expect(t.fp('gui', 'off').code).toBe(0);
  });
});

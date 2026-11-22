import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function start() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname === '/api/ping') { res.setHeader('content-type', 'application/json'); setTimeout(() => res.end('{"ok":true}'), 300); return; }
    if (u.pathname === '/slow') {
      res.setHeader('content-type', 'text/html');
      setTimeout(() => res.end('<!doctype html><title>Slow Page</title><h1>Slow Arrived</h1><button>Slow Button</button>'), Number(u.searchParams.get('ms') ?? 800));
      return;
    }
    if (u.pathname === '/login' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        if (p.get('username') === 'tester' && p.get('password') === 'hunter2-secret') {
          res.writeHead(302, { 'set-cookie': 'sid=abc123; Path=/', location: '/dashboard.html' });
        } else res.writeHead(302, { location: '/login.html?error=1' });
        res.end();
      });
      return;
    }
    if (u.pathname === '/dashboard.html' && !(req.headers.cookie ?? '').includes('sid=abc123')) { res.writeHead(302, { location: '/login.html' }); res.end(); return; }
    const file = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.setHeader('content-type', 'text/html'); res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    resolve(port);
  }));
}
start().then((port) => console.log(port));

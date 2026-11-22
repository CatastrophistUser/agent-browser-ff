# agent-browser-ff

Browser automation CLI for AI agents and humans, built on Firefox.

agent-browser-ff is a Firefox-first alternative to agent-browser and playwright-cli. A long-lived daemon owns the browser, so page state survives between separate shell commands. It also ships an Agent Skill that teaches coding agents (Claude Code, Codex, Cursor, etc.) how to drive it.

## Features

- Open and test pages in Firefox, headless by default.
- `--gui` mode: run headed so a human can watch every action, with an on-page overlay.
- Act on elements through short, token-efficient refs (`@e1`) instead of brittle selectors.
- Macro recorder: record a sequence of events (or build one from CLI history) and replay it with parameters.
- Scraping: schema-based extraction, pagination, and crawling, including dynamic pages.
- Sessions, storage state, persistent profiles, and an encrypted credential vault with TOTP.
- Screenshots, PDF, video, console, and network/HAR capture.

> Firefox only. No Chromium or WebKit, no CDP, no cloud browser providers.

## Install

```bash
npm install -g agent-browser-ff
agent-browser-ff install        # downloads Playwright's Firefox build
agent-browser-ff --version
```

Install the agent skill:

```bash
npx skills add CatastrophistUser/agent-browser-ff --skill agent-browser-ff -g
```

Requires Node.js 20+.

## Quick start

```bash
agent-browser-ff open https://example.com
agent-browser-ff snapshot              # prints the page tree with refs like @e1
agent-browser-ff click @e4
agent-browser-ff fill @e2 "hello"
agent-browser-ff screenshot --out page.png
agent-browser-ff close
```

The core loop is: **open → snapshot → act on refs → re-snapshot after navigation → close**. Refs belong to a snapshot generation; using a stale ref returns `E_STALE_REF` with a hint to re-run `snapshot`.

Watch it work:

```bash
agent-browser-ff open https://example.com --gui
agent-browser-ff gui off               # switch back to headless, session preserved
```

## Commands

All commands accept `--session <name>` (default `default`), `--json`, and `--timeout <ms>`.

| Area | Commands |
| --- | --- |
| Launch and mode | `open`, `gui on\|off`, `close`, `daemon status\|stop` |
| Navigation and waiting | `goto`, `back`, `forward`, `reload`, `follow`, `wait`, `paginate`, `tabs` |
| Interaction | `click`, `hover`, `type`, `fill`, `press`, `check`, `uncheck`, `select`, `drag`, `upload`, `scroll`, `form fill` |
| Extraction and inspection | `snapshot`, `text`, `attr`, `html`, `eval`, `screenshot`, `pdf`, `video`, `console`, `network`, `test assert` |
| Scraping | `scrape`, `crawl` |
| Macros | `macro record\|stop\|list\|show\|play\|edit\|delete\|from-history` |
| Sessions and auth | `session`, `state save\|load`, `vault add\|list\|remove\|fill`, `login` |

Run `agent-browser-ff --help` or see [`skills/agent-browser-ff/references/`](skills/agent-browser-ff/references) for the full reference.

## Macros

Macros are YAML files stored in `~/.agent-browser-ff/macros/`:

```yaml
name: search-and-open-first
version: 1
vars:
  query: { required: true }
steps:
  - goto: https://example.com
  - fill: { target: { role: searchbox, name: Search }, value: "{{query}}" }
  - press: Enter
  - wait: networkidle
  - click: { target: { role: link, nth: 0 }, fallback: { css: "a.result" } }
```

```bash
agent-browser-ff macro play search-and-open-first --var query="firefox"
```

Password field values are never recorded.

## Scraping

```bash
agent-browser-ff scrape --schema schema.yaml --paginate-next "a.next" --max-pages 5 --out results.json
agent-browser-ff crawl https://example.com --match "https://example.com/blog/*" --schema schema.yaml
```

Crawls respect `robots.txt` by default, with a 1000 ms per-domain delay.

## Output and exit codes

Default output is short plain text (one line per success). `--json` returns `{ "ok": true, "result": ... }` or `{ "ok": false, "error": { "code", "message", "hint" } }`. Large artifacts are written to `./.agent-browser-ff/artifacts/` and the path is printed.

| Exit | Meaning |
| --- | --- |
| 0 | success |
| 1 | generic failure |
| 2 | bad arguments |
| 3 | timeout |
| 4 | element not found / stale ref |
| 5 | assertion failed |
| 6 | daemon unavailable |
| 7 | auth / vault error |

## Security

- The daemon listens only on a local socket (`~/.agent-browser-ff/run/daemon.sock`, mode `0600`), never TCP.
- Vault credentials are encrypted at rest, with the key held in the OS keychain. Secrets never appear in stdout, logs, macros, or history.
- Storage state files contain live cookies; treat them like credentials.
- Downloads go to `./.agent-browser-ff/downloads/` and are never opened or executed.

## Development

```bash
pnpm install
pnpm exec playwright install firefox
pnpm build
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
node dist/cli.js --help
```

See [AGENTS.md](AGENTS.md) for architecture and contribution rules.

## License

[MIT](LICENSE)

## Website

The docs site lives in `website/` (Astro Starlight). Run `cd website && pnpm install && pnpm dev`.

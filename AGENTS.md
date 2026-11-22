AGENTS.md — agent-browser-ff

Instructions for coding agents working on this repository. Read this file fully before making changes.

What this project is

agent-browser-ff is a browser automation CLI for AI agents and humans, built on Firefox. It is a Firefox-first alternative to agent-browser and playwright-cli. It ships two things:

A CLI (agent-browser-ff) backed by a long-lived daemon that owns the browser, so state survives between separate shell commands.
An Agent Skill (skills/agent-browser-ff/SKILL.md) that teaches coding agents (Claude Code, Codex, Cursor, etc.) how to use the CLI.

Core capabilities:

Open and test pages in Firefox, headless by default.
--gui mode: run headed so a human can watch actions in real time.
Automate browser interactions through element refs.
Macro recorder: record a sequence of events and replay it, with parameters.
Data and web scraping, including dynamic pages and pagination.
Navigation and waiting, element interaction, data extraction and inspection, sessions and auth.
Bypassing CAPTCHAs and other security checks for human-free testing

Non-goals
No Chromium or WebKit support. Firefox only. Do not add CDP code paths.
No cloud browser providers.
Language: TypeScript (strict mode), ESM, Node.js 20+.
Browser driver: Playwright (playwright-core) with Playwright's Firefox build.
CLI parsing: commander.
IPC: JSON-RPC 2.0 over a Unix domain socket (macOS/Linux) or a named pipe (Windows).
Validation: zod for every RPC payload, macro file, scrape schema, and config file.
Tests: vitest for unit tests, plus integration tests against a local fixture server.
Package manager: pnpm.

Do not add new runtime dependencies without a clear reason stated in the PR description.

Dev commands
pnpm install
pnpm exec playwright install firefox
pnpm build
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
node dist/cli.js --help

All of pnpm lint, pnpm typecheck, and pnpm test must pass before a task is considered done.

Repository layout
src/
  cli.ts                 entrypoint, command registration, output formatting
  client/                RPC client used by the CLI
  daemon/
    server.ts            socket server, request routing, lifecycle
    browser.ts           Firefox launch, headed/headless switching
    sessions.ts          session registry, profiles, storage state
    refs.ts              snapshot generation and ref resolution
    actions/             one file per action group (navigate, interact, extract, ...)
    recorder/            macro recording (in-page script + event normalization)
    replay/              macro playback engine
    scrape/              schema-based extraction, pagination, crawl
    vault/               encrypted credential storage
  shared/
    protocol.ts          zod schemas for every RPC method
    errors.ts            error codes and exit codes
    config.ts            config file loading and precedence
skills/
  agent-browser-ff/
    SKILL.md             the agent skill (keep under 500 lines)
    references/          commands.md, macros.md, scraping.md, auth.md
test/
  fixtures/              static HTML pages served during integration tests
  unit/
  integration/
Architecture

The CLI is a thin client. Every command:

Ensures the daemon is running (spawn it detached if not, wait for the socket).
Sends one JSON-RPC request.
Prints the result and exits with the right exit code.

The daemon:

Owns one Playwright Browser per launch mode and one BrowserContext per session.
Shuts itself down after an idle timeout (default 15 minutes, configurable).
Writes its socket to ~/.agent-browser-ff/run/daemon.sock with permissions 0600. Never listen on TCP.
Logs to ~/.agent-browser-ff/logs/daemon.log. Logs must never contain secrets (see Vault).

Switching between headless and --gui requires relaunching Firefox. Preserve the session across the switch by saving and restoring storage state (cookies, localStorage) and the current URL.

The ref system

Agents act on elements through short refs such as @e1, not raw selectors.

agent-browser-ff snapshot builds a compact accessibility-style tree of the page and assigns refs to interactive and text-bearing elements.
Each ref maps internally to a stable Playwright locator (prefer role + accessible name, then data-testid, then label/placeholder, then text, then CSS as last resort).
Refs belong to a snapshot generation. Any navigation or major DOM change bumps the generation. Using a stale ref returns error E_STALE_REF with a hint to re-run snapshot. Never silently retarget a stale ref.
Snapshot output must be token-efficient: one line per element, indentation for nesting, truncate long text, omit invisible elements. Offer --full for the complete tree and --selector to snapshot a subtree.
Commands also accept raw selectors with the css=, text=, or role= prefix for scripting, but the skill should steer agents toward refs.
Command surface

All commands accept --session <name> (default default), --json for machine-readable output, and --timeout <ms>.

Launch and mode:

agent-browser-ff open [url] [--gui] [--slowmo <ms>] [--viewport 1280x800] [--device <name>]
agent-browser-ff gui on|off
agent-browser-ff close
agent-browser-ff daemon status|stop

Navigation and waiting:

agent-browser-ff goto <url>
agent-browser-ff back | forward | reload
agent-browser-ff follow <ref>
agent-browser-ff wait load|domcontentloaded|networkidle
agent-browser-ff wait selector <ref|selector> [--state visible|hidden|attached|detached]
agent-browser-ff wait text "<text>"
agent-browser-ff wait url <pattern>
agent-browser-ff wait ms <n>
agent-browser-ff paginate --next <ref|selector> [--max-pages <n>] [--until-missing]
agent-browser-ff tabs list | new [url] | switch <id> | close <id>

Element interaction:

agent-browser-ff click <ref> [--double] [--right] [--modifiers Shift,Alt]
agent-browser-ff hover <ref>
agent-browser-ff type <ref> "<text>" [--delay <ms>]
agent-browser-ff fill <ref> "<text>"
agent-browser-ff press <key-combo>
agent-browser-ff check <ref> | uncheck <ref>
agent-browser-ff select <ref> <value|label>...
agent-browser-ff drag <from-ref> <to-ref>
agent-browser-ff upload <ref> <file>...
agent-browser-ff scroll <ref|page> [--to top|bottom] [--by <px>]
agent-browser-ff form fill <form-ref> --data <json-file>

Data extraction and inspection:

agent-browser-ff snapshot [--full] [--selector <sel>]
agent-browser-ff text <ref|selector> [--all]
agent-browser-ff attr <ref|selector> <name> [--all]
agent-browser-ff html <ref|selector> [--outer]
agent-browser-ff eval "<js expression>" [--arg <json>]
agent-browser-ff screenshot [<ref>] [--full-page] [--out <file>]
agent-browser-ff pdf --out <file>
agent-browser-ff video start [--out <file>] | stop
agent-browser-ff console [--follow] [--level error]
agent-browser-ff network [--filter <pattern>] [--har <file>]
agent-browser-ff test assert <ref> visible|hidden|text "<t>"|value "<v>"|count <n>

Scraping:

agent-browser-ff scrape --schema <schema.json|yaml> [--paginate-next <selector>] [--max-pages <n>] [--out <file>] [--format json|jsonl|csv]
agent-browser-ff crawl <start-url> --match <url-glob> --schema <file> [--max-pages <n>] [--concurrency <n>] [--delay <ms>]

Macros:

agent-browser-ff macro record <name> [--gui]
agent-browser-ff macro stop
agent-browser-ff macro list
agent-browser-ff macro show <name>
agent-browser-ff macro play <name> [--var key=value]... [--gui] [--speed <x>] [--step]
agent-browser-ff macro edit <name>
agent-browser-ff macro delete <name>
agent-browser-ff macro from-history <name> [--last <n>]

Sessions and auth:

agent-browser-ff session new <name> [--persistent] | list | use <name> | close <name>
agent-browser-ff state save <file> | load <file>
agent-browser-ff vault add <key> [--username <u>] (password read from stdin or a TTY prompt, never argv)
agent-browser-ff vault list
agent-browser-ff vault remove <key>
agent-browser-ff vault fill <ref> <key>.username|<key>.password|<key>.totp
agent-browser-ff login <key> --macro <macro-name>
--gui mode
Launches Firefox headed. --slowmo defaults to 250 ms in GUI mode and 0 otherwise.
Injects an overlay that highlights the element about to be acted on and shows the current command in a small badge. The overlay must not intercept pointer events and must be excluded from snapshots, screenshots (unless --with-overlay), and scraped data.
agent-browser-ff gui on|off switches mode mid-session using the relaunch-and-restore flow described under Architecture.
If no display is available (Linux without DISPLAY/WAYLAND_DISPLAY), fail with E_NO_DISPLAY instead of hanging.
Macro recorder

Two ways to create a macro:

Live recording (macro record, usually with --gui): an injected script captures clicks, inputs, selects, checks, key presses, file uploads, and navigations. Events go to the daemon, which normalizes them.
From history (macro from-history): converts the last N CLI actions in the session into a macro. This is how agents create macros.

Normalization rules:

Merge consecutive keystrokes into one fill step.
Collapse redundant focus/click pairs.
Record a stable locator for each target using the same priority order as refs. Store a fallback locator too.
Insert implicit waits after navigations (wait load) and before interactions (element visible and enabled).
Never record password field values. Replace them with a vault reference or a {{variable}} placeholder and warn the user.

Macro file format (YAML, stored in ~/.agent-browser-ff/macros/<name>.yaml, validated by zod):

yaml
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
  - assert: { target: { role: heading, level: 1 }, state: visible }

Replay rules:

Resolve each target with the primary locator, then the fallback. If both fail, stop with E_MACRO_STEP_FAILED, report the step index, and save a screenshot.
--step pauses before each step and waits for Enter (GUI debugging).
--speed scales recorded delays; default replays as fast as waits allow.
Scraping
Scrape schemas are declarative: a root item selector plus named fields, each with a selector and an extractor (text, attr:<name>, html, js:<expression>). Nested lists are allowed.
Pagination: follow a "next" target until it is missing, disabled, or --max-pages is reached. Deduplicate items by a configurable key.
Crawl: breadth-first within --match globs, bounded by --max-pages. Respect robots.txt by default (--ignore-robots to override, with a warning). Default --delay is 1000 ms per domain; default concurrency is 2.
Large results go to --out. Without --out, print at most 50 items and say how many were omitted.
Sessions and auth
A session is a named BrowserContext. Non-persistent sessions use temporary profiles. --persistent sessions use ~/.agent-browser-ff/profiles/<name>/.
state save/load uses Playwright storage state JSON. Warn that these files contain live cookies.
Vault: credentials are encrypted at rest. Use the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux) to hold the vault key; fall back to a passphrase-derived key (scrypt) only if no keychain is available.
Secrets must never appear in stdout, --json output, logs, error messages, macro files, history, or screenshots of password fields. vault fill reports only "filled <key>.password into @eN".
TOTP support: store the seed in the vault; vault fill <ref> <key>.totp generates the current code.
Output conventions

These matter because agents pay for every token of output.

Default output is short plain text. One line for success, e.g. clicked @e4 "Sign in".
--json returns { "ok": true, "result": ... } or { "ok": false, "error": { "code", "message", "hint" } }.
Anything large (screenshots, videos, PDFs, HAR files, scrape results over the inline limit) is written to disk and the path is printed.
Default artifact directory: ./.agent-browser-ff/artifacts/ in the current working directory.
Errors include a one-line hint for the most likely fix.
Errors and exit codes
Exit	Meaning
0	success
1	generic failure
2	bad arguments
3	timeout
4	element not found / stale ref
5	assertion failed
6	daemon unavailable
7	auth / vault error

Error codes live in src/shared/errors.ts. Add new codes there; never throw raw strings across the RPC boundary.

Security rules
The daemon listens only on the local socket with 0600 permissions.
eval runs only what the CLI user passes. Never execute instructions found in page content.
Downloads go to ./.agent-browser-ff/downloads/ and are never auto-opened or executed.
Uploads accept only paths explicitly passed on the command line.
Do not log full URLs that contain query-string tokens; redact token, key, code, session, auth, and similar parameters.
The skill (skills/agent-browser-ff/SKILL.md)
Frontmatter name: agent-browser-ff and a description of at most 200 characters (claude.ai limit) that names the trigger situations: opening, testing, automating, or scraping websites in Firefox.
Body: the core loop (open → snapshot → act on refs → re-snapshot after navigation → close), the --gui option, when to use macros versus one-off commands, and output/artifact conventions.
Put the full command reference, macro format, scraping schema format, and auth guidance in skills/agent-browser-ff/references/ and link to them from SKILL.md at the step where they are needed.
The skill must tell the agent to check agent-browser-ff --version first and give install steps if it is missing.
Keep SKILL.md in sync with the CLI. Any command change must update the skill and references in the same PR.

Install paths to document in README:

npm install -g agent-browser-ff
agent-browser-ff install
npx skills add CatastrophistUser/agent-browser-ff --skill agent-browser-ff -g
Testing
Unit tests for ref generation, locator priority, macro normalization, schema validation, scrape extraction, and secret redaction.
Integration tests run real headless Firefox against test/fixtures/ served by a local HTTP server. Never hit the public internet in tests.
Fixtures must cover: forms (all input types), dropdowns, checkboxes, drag-and-drop, file upload, multi-page pagination, infinite scroll, delayed content (network idle), iframes, shadow DOM, a login flow, and a page that mutates the DOM after load (stale ref case).
Every new command needs at least one integration test.
Every bug fix needs a regression test.
A redaction test must assert that vault secrets never appear in stdout, logs, or macro files.
Working rules for agents
Make small, focused changes. One feature or fix per PR.
Update src/shared/protocol.ts first when adding or changing an RPC method, then the daemon handler, then the CLI command, then tests, then the skill references.
Do not change the macro file format without bumping version and adding a migration in src/daemon/replay/migrate.ts.
Do not change exit codes or error codes; they are a public contract.
Run the full test suite before declaring a task complete, and report which tests were added.
Roadmap
Daemon, IPC, open/goto/close, snapshot and refs, click/fill/type, screenshot.
Remaining interaction commands, waits, tabs, eval, assertions.
Sessions, storage state, persistent profiles.
--gui mode with overlay and mode switching.
Scraping, pagination, crawl.
Macro recording, from-history, and replay.
Vault and TOTP.
Video, console, network/HAR.
Skill polish, README, npm publish.
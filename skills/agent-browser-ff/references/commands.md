# agent-browser-ff command reference

All commands accept `--session <name>` (default `default`), `--json`, and `--timeout <ms>`.

## Launch and mode

```
agent-browser-ff install                 # download Playwright's Firefox build
agent-browser-ff open [url] [--gui] [--slowmo <ms>] [--viewport 1280x800] [--device <name>]
agent-browser-ff gui on|off
agent-browser-ff close
agent-browser-ff daemon status|stop
```

- `--slowmo` defaults to 250 ms with `--gui`, 0 otherwise.
- `gui on|off` relaunches Firefox, preserving cookies, localStorage, and URL.
- The daemon exits itself after an idle timeout (default 15 min).

## Navigation and waiting

```
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
```

## Element interaction

```
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
```

## Data extraction and inspection

```
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
```

- Screenshots exclude the GUI overlay unless `--with-overlay` is passed.
- `pdf` is **not supported**: Playwright cannot print PDFs from Firefox. It fails with `E_UNSUPPORTED`; use `screenshot --full-page` instead.
- `eval` takes a single expression (`document.title`, `arg.x * 2`). For several statements use `return`: `eval "const a = 2; return a * 4"`. Results over 4000 chars are truncated.
- `video start` relaunches the browser with recording on (session preserved); `video stop` saves a `.webm`.
- `console --follow` keeps printing new messages until interrupted.
- Files go to `./.agent-browser-ff/artifacts/` unless `--out` is given.

## Scraping

```
agent-browser-ff scrape --schema <schema.json|yaml> [--paginate-next <selector>] [--max-pages <n>] [--out <file>] [--format json|jsonl|csv]
agent-browser-ff crawl <start-url> --match <url-glob> --schema <file> [--max-pages <n>] [--concurrency <n>] [--delay <ms>] [--ignore-robots] [--out <file>] [--format json|jsonl|csv]
```

See [scraping.md](scraping.md).

## Macros

```
agent-browser-ff macro record <name> [--gui]
agent-browser-ff macro stop
agent-browser-ff macro list
agent-browser-ff macro show <name>
agent-browser-ff macro play <name> [--var key=value]... [--gui] [--speed <x>] [--step]
agent-browser-ff macro edit <name>
agent-browser-ff macro delete <name>
agent-browser-ff macro from-history <name> [--last <n>]
```

See [macros.md](macros.md).

## Sessions and auth

```
agent-browser-ff session new <name> [--persistent] | list | use <name> | close <name>
agent-browser-ff state save <file> | load <file>
agent-browser-ff vault add <key> [--username <u>] [--totp]   # password (and TOTP seed with --totp) from stdin or a prompt
agent-browser-ff vault list
agent-browser-ff vault remove <key>
agent-browser-ff vault fill <ref> <key>.username|<key>.password|<key>.totp
agent-browser-ff login <key> --macro <macro-name>
```

See [auth.md](auth.md).

## Selectors

Refs (`@e1`) come from `snapshot`. Raw selectors use a prefix: `css=`, `text=`, `role=`. Locator priority used internally: role + accessible name, `data-testid`, label/placeholder, text, CSS.

## Error codes and exit codes

| Exit | Meaning |
|------|---------|
| 0 | success |
| 1 | generic failure |
| 2 | bad arguments |
| 3 | timeout |
| 4 | element not found / stale ref (`E_STALE_REF`) |
| 5 | assertion failed |
| 6 | daemon unavailable |
| 7 | auth / vault error |

Other codes: `E_NO_DISPLAY` (no display for `--gui`), `E_MACRO_STEP_FAILED` (macro replay step failed).

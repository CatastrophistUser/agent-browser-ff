---
title: Output and errors
description: What commands print and how they fail.
---

Output is designed to be cheap for agents to read.

## Default output

One short plain-text line per success, for example:

```text
clicked @e4 "Sign in"
```

## JSON output

Add `--json` to any command.

```json
{ "ok": true, "result": "..." }
```

```json
{ "ok": false, "error": { "code": "E_STALE_REF", "message": "...", "hint": "Run snapshot again" } }
```

Every error includes a one-line `hint` naming the most likely fix.

## Artifacts

Anything large is written to disk and the path is printed: screenshots, videos, PDFs, HAR files, and scrape results over the inline limit.

- Default directory: `./.agent-browser-ff/artifacts/`
- Override with `--out <file>`
- Without `--out`, `scrape` prints at most 50 items and reports how many were omitted

## Global flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--session <name>` | `default` | Target a session |
| `--json` | off | Machine-readable output |
| `--timeout <ms>` | per command | Fail with exit 3 if exceeded |

See [Exit and error codes](/reference/errors/) for the full list.

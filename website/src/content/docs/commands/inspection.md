---
title: Extraction and inspection
description: snapshot, text, attr, eval, screenshot, video, console, network, assertions.
---

| Command | Description |
| --- | --- |
| `snapshot [--full] [--selector <sel>]` | Compact tree with refs |
| `text <ref\|selector> [--all]` | Element text |
| `attr <ref\|selector> <name> [--all]` | Attribute value |
| `html <ref\|selector> [--outer]` | Inner or outer HTML |
| `eval "<js>" [--arg <json>]` | Run a JavaScript expression |
| `screenshot [<ref>] [--full-page] [--out <file>]` | Capture a screenshot |
| `pdf --out <file>` | Not supported in Firefox. See below |
| `video start [--out <file>]` / `video stop` | Record a `.webm` |
| `console [--follow] [--level error]` | Browser console messages |
| `network [--filter <pattern>] [--har <file>]` | Requests, optionally saved as HAR |
| `test assert <ref> <check>` | Assert on an element |

## eval

Takes a single expression such as `document.title` or `arg.x * 2`. For several statements use `return`:

```bash
agent-browser-ff eval "const a = 2; return a * 4"
```

Results over 4000 characters are truncated. `eval` runs only what you pass.

## screenshot

Excludes the GUI overlay unless `--with-overlay` is passed. Files go to `./.agent-browser-ff/artifacts/` unless `--out` is set.

## pdf

Playwright cannot print PDFs from Firefox. The command fails with `E_UNSUPPORTED`. Use `screenshot --full-page` instead.

## video

`video start` relaunches the browser with recording on, preserving the session. `video stop` saves the `.webm`.

## console and network

```bash
agent-browser-ff console --level error
agent-browser-ff console --follow
agent-browser-ff network --filter "/api/" --har trace.har
```

`console --follow` keeps printing until interrupted.

## Assertions

```bash
agent-browser-ff test assert @e3 visible
agent-browser-ff test assert @e3 hidden
agent-browser-ff test assert @e3 text "Welcome back"
agent-browser-ff test assert @e4 value "abc"
agent-browser-ff test assert @e8 count 5
```

A failed assertion exits with code 5.

---
title: Testing a page
description: Assertions, diagnostics and a typical test flow.
---

## Assertions

```bash
agent-browser-ff test assert @e3 visible
agent-browser-ff test assert @e3 hidden
agent-browser-ff test assert @e3 text "Welcome back"
agent-browser-ff test assert @e4 value "abc"
agent-browser-ff test assert @e8 count 5
```

A failed assertion exits with code 5, so it works in shell scripts and CI.

## Diagnose failures

| Tool | Use |
| --- | --- |
| `screenshot --full-page` | See what the page looked like |
| `console --level error` | JavaScript errors |
| `network --filter <pattern>` | Failed or unexpected requests |
| `network --har <file>` | Full trace for later analysis |
| `video start` / `video stop` | Record a whole flow |

## Example

```bash
agent-browser-ff open http://localhost:3000
agent-browser-ff snapshot
agent-browser-ff fill @e2 "test@example.com"
agent-browser-ff click @e4
agent-browser-ff wait text "Dashboard"
agent-browser-ff test assert @e1 text "Dashboard"
agent-browser-ff console --level error
agent-browser-ff close
```

## In CI

Run headless, use `--json` for parsing, and rely on exit codes. Use `--timeout <ms>` to bound slow steps.

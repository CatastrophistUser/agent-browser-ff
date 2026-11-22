---
title: Macros
description: Record, edit and replay parameterized flows.
---

A macro is a saved, parameterized sequence of steps, stored at `~/.agent-browser-ff/macros/<name>.yaml` and validated on load.

## Creating macros

| Way | When |
| --- | --- |
| `macro from-history <name> --last <n>` | Preferred for agents. Converts the last N CLI actions |
| `macro record <name> --gui` then `macro stop` | A human performs the flow in a headed browser |

Live recording captures clicks, inputs, selects, checks, key presses and navigations. File uploads are not recorded because the path is unknown; add them with `macro edit`.

Review with `macro show <name>` and adjust with `macro edit <name>`.

## Normalization

| Rule | Effect |
| --- | --- |
| Merge keystrokes | Consecutive keystrokes become one `fill` |
| Collapse focus/click | Redundant pairs are removed |
| Locators | Each target gets a stable locator and a fallback |
| Implicit waits | `wait load` after navigations, visible-and-enabled before interactions |
| Passwords | Never recorded. Replaced by a vault reference or `{{variable}}`, with a warning |

## File format

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
  - assert: { target: { role: heading, level: 1 }, state: visible }
```

| Key | Meaning |
| --- | --- |
| `name`, `version` | Identity and format version. Changing the format bumps `version` and adds a migration |
| `vars` | Parameters, referenced as `{{name}}` |
| `steps` | Ordered steps: `goto`, `fill`, `press`, `wait`, `click`, `assert` |
| `target` | Primary locator (`role`, `name`, `nth`, `level`, ...) |
| `fallback` | Secondary locator, e.g. `{ css: "..." }` |

## Replay

```bash
agent-browser-ff macro play search-and-open-first --var query="firefox automation"
agent-browser-ff macro play my-flow --gui --step
agent-browser-ff macro play my-flow --speed 2
```

| Flag | Effect |
| --- | --- |
| `--var key=value` | Set a variable, repeatable |
| `--step` | Pause before each step, press Enter to continue |
| `--speed <x>` | Scale recorded delays. Default runs as fast as waits allow |
| `--gui` | Watch it run |

## When a step fails

Each target is resolved with the primary locator, then the fallback. If both fail, replay stops with `E_MACRO_STEP_FAILED`, reports the step index, and saves a screenshot to the artifacts directory. Open the screenshot, fix the step with `macro edit`, and replay.

## Secrets

Never hard-code passwords. Use `{{variable}}` or a vault reference, and combine a vault entry with a login macro:

```bash
agent-browser-ff login example --macro example-login
```

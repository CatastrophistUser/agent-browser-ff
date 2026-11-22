---
title: Navigation and waiting
description: goto, back, wait, paginate, tabs.
---

## Navigate

| Command | Description |
| --- | --- |
| `goto <url>` | Navigate the current tab |
| `back` / `forward` / `reload` | History navigation and reload |
| `follow <ref>` | Click a link and wait for navigation |

## Wait

Do not sleep blindly. Wait on a condition.

| Command | Waits for |
| --- | --- |
| `wait load` | The load event |
| `wait domcontentloaded` | DOMContentLoaded |
| `wait networkidle` | No network activity |
| `wait selector <ref\|selector> [--state visible\|hidden\|attached\|detached]` | An element state |
| `wait text "<text>"` | Text to appear |
| `wait url <pattern>` | The URL to match a glob, e.g. `"**/dashboard"` |
| `wait ms <n>` | A fixed delay. Last resort |

## paginate

```bash
agent-browser-ff paginate --next <ref|selector> [--max-pages <n>] [--until-missing]
```

Follows a "next" target until it is missing, disabled, or `--max-pages` is reached. For structured results use [`scrape`](/guides/scraping/).

## tabs

```bash
agent-browser-ff tabs list
agent-browser-ff tabs new [url]
agent-browser-ff tabs switch <id>
agent-browser-ff tabs close <id>
```

Commands act on the current tab. After a popup, run `tabs list` then `tabs switch <id>`.

---
title: Launch and mode
description: open, gui, close, daemon, install.
---

All commands accept `--session <name>`, `--json` and `--timeout <ms>`.

| Command | Description |
| --- | --- |
| `install` | Download Playwright's Firefox build |
| `setup` | Check PATH, download Firefox, and offer to install the agent skill |
| `open [url]` | Launch or reuse the browser and optionally load a URL |
| `gui on\|off` | Switch between headed and headless, preserving the session |
| `close` | Close the browser for the session |
| `daemon status\|stop` | Inspect or stop the daemon |

## open

```bash
agent-browser-ff open [url] [--gui] [--slowmo <ms>] [--viewport 1280x800] [--device <name>]
```

| Flag | Meaning |
| --- | --- |
| `--gui` | Run headed with the overlay |
| `--slowmo <ms>` | Delay between actions. Default 250 with `--gui`, else 0 |
| `--viewport WxH` | Viewport size, for example `1280x800` |
| `--device <name>` | Emulate a Playwright device descriptor |

## gui

```bash
agent-browser-ff gui on
agent-browser-ff gui off
```

Relaunches Firefox and restores cookies, localStorage and the URL.

## daemon

```bash
agent-browser-ff daemon status
agent-browser-ff daemon stop
```

The daemon exits by itself after an idle timeout (default 15 minutes).

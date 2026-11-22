---
title: Troubleshooting
description: Common problems and fixes.
---

| Symptom | Cause | Fix |
| --- | --- | --- |
| `E_STALE_REF` (exit 4) | Page changed since the last snapshot | Run `snapshot`, use the new refs |
| Exit 6, daemon unavailable | Daemon not running or crashed | `agent-browser-ff daemon status`, then retry. Check `~/.agent-browser-ff/logs/daemon.log` |
| `E_NO_DISPLAY` | `--gui` on Linux with no display | Run headless, or set `DISPLAY` / `WAYLAND_DISPLAY` |
| Exit 3, timeout | Page or condition too slow | Raise `--timeout <ms>`, wait on a condition instead of a delay |
| `pdf` fails with `E_UNSUPPORTED` | Firefox cannot print PDFs via Playwright | `screenshot --full-page` |
| Click does nothing on a dropdown | Native `<select>` needs `select` | Use `select <ref> <value>` |
| Input ignores `fill` | Field reacts to key events | Use `type` |
| Content missing from snapshot | Still loading | `wait networkidle` or `wait selector`, then snapshot |
| Content hidden in snapshot | Compact view omits it | `snapshot --full` or `--selector` |
| Element is in a popup | Different tab | `tabs list`, then `tabs switch <id>` |
| Macro stops at a step | Locator no longer matches | Check the saved screenshot, fix with `macro edit` |
| Vault asks for a passphrase | No OS keychain | Enter it, or set `AGENT_BROWSER_FF_VAULT_PASSPHRASE` |

## Reset everything

```bash
agent-browser-ff daemon stop
```

The next command starts a fresh daemon.

---
title: GUI mode
description: Run Firefox headed so a human can watch.
---

Add `--gui` to `open` to launch Firefox headed.

```bash
agent-browser-ff open https://example.com --gui
agent-browser-ff gui off        # switch to headless
agent-browser-ff gui on         # switch back
```

## What changes

| Behaviour | Detail |
| --- | --- |
| Speed | `--slowmo` defaults to 250 ms in GUI mode and 0 otherwise |
| Overlay | Highlights the element about to be acted on and shows the current command in a small badge |
| Pointer events | The overlay never intercepts them |
| Exclusions | Overlay is left out of snapshots, screenshots (unless `--with-overlay`) and scraped data |

## Switching mid-session

`gui on|off` relaunches Firefox and restores cookies, localStorage and the current URL.

## No display

On Linux without `DISPLAY` or `WAYLAND_DISPLAY`, `--gui` fails immediately with `E_NO_DISPLAY` instead of hanging. Use headless mode there.

## Useful with

- `macro record <name> --gui` to let a human perform a flow
- `macro play <name> --gui --step` to pause before each step and press Enter

---
title: Element interaction
description: click, fill, type, select, drag, upload, scroll and more.
---

| Command | Description |
| --- | --- |
| `click <ref> [--double] [--right] [--modifiers Shift,Alt]` | Click an element |
| `hover <ref>` | Hover |
| `type <ref> "<text>" [--delay <ms>]` | Send keystrokes |
| `fill <ref> "<text>"` | Replace the value |
| `press <key-combo>` | Press a key or combo, e.g. `Enter`, `Control+A` |
| `check <ref>` / `uncheck <ref>` | Set a checkbox |
| `select <ref> <value\|label>...` | Choose dropdown options |
| `drag <from-ref> <to-ref>` | Drag and drop |
| `upload <ref> <file>...` | Attach files to a file input |
| `scroll <ref\|page> [--to top\|bottom] [--by <px>]` | Scroll |
| `form fill <form-ref> --data <json-file>` | Fill a whole form from JSON |

## fill vs type

- `fill` replaces the value in one step.
- `type` sends real keystrokes. Use it for inputs that react to key events.

## Dropdowns

Use `select`, not `click`.

```bash
agent-browser-ff select @e9 "United States"
```

## Uploads

Only paths passed explicitly on the command line are accepted.

```bash
agent-browser-ff upload @e5 ./report.pdf
```

## Forms

```bash
agent-browser-ff form fill @e3 --data person.json
```

## Infinite scroll

Combine scrolling with a wait in a loop:

```bash
agent-browser-ff scroll page --to bottom
agent-browser-ff wait networkidle
```

---
title: Exit and error codes
description: Every exit code and error code.
---

Exit codes and error codes are a public contract.

## Exit codes

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Generic failure |
| 2 | Bad arguments |
| 3 | Timeout |
| 4 | Element not found or stale ref |
| 5 | Assertion failed |
| 6 | Daemon unavailable |
| 7 | Auth or vault error |

## Error codes

| Code | Meaning | Usual fix |
| --- | --- | --- |
| `E_STALE_REF` | The ref belongs to an older snapshot | Run `snapshot` again |
| `E_NO_DISPLAY` | `--gui` with no display available | Use headless, or set a display |
| `E_MACRO_STEP_FAILED` | A macro step could not resolve its target | Open the saved screenshot, fix with `macro edit` |
| `E_UNSUPPORTED` | The command is not supported in Firefox (e.g. `pdf`) | Use `screenshot --full-page` |

Every error in `--json` output carries `code`, `message` and `hint`.

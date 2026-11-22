---
title: Security
description: What the daemon, vault and files do and do not expose.
---

| Area | Behaviour |
| --- | --- |
| Daemon | Listens only on a local socket with mode `0600`, never TCP |
| `eval` | Runs only what the CLI user passes. Page content is never executed as instructions |
| Downloads | Go to `./.agent-browser-ff/downloads/` and are never auto-opened or executed |
| Uploads | Only paths passed explicitly on the command line |
| URLs in logs | Query parameters such as `token`, `key`, `code`, `session`, `auth` are redacted |
| Vault | Encrypted at rest, key in the OS keychain, scrypt passphrase fallback |
| Secrets | Never in stdout, `--json`, logs, errors, macros, history or password-field screenshots |
| State files | Contain live cookies. Treat them like credentials |

## Crawling etiquette

Crawls respect `robots.txt` by default and wait 1000 ms per domain. `--ignore-robots` prints a warning. Use it only on sites you own or are authorized to crawl.

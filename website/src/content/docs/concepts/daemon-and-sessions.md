---
title: Daemon and sessions
description: How state survives between shell commands.
---

## The daemon

The first command you run starts the daemon, detached, and waits for its socket. Later commands reuse it.

| Property | Value |
| --- | --- |
| Transport | JSON-RPC 2.0 over a Unix socket or Windows named pipe |
| Socket | `~/.agent-browser-ff/run/daemon.sock`, mode `0600` |
| Network | Never listens on TCP |
| Idle timeout | 15 minutes by default, then it exits |
| Log | `~/.agent-browser-ff/logs/daemon.log` |

```bash
agent-browser-ff daemon status
agent-browser-ff daemon stop
```

Exit code 6 means the daemon is unavailable. The CLI normally starts it for you; run `daemon status` to inspect.

## Sessions

A session is a named BrowserContext with its own cookies and storage. Every command accepts `--session <name>` (default `default`).

| Kind | Profile | Lifetime |
| --- | --- | --- |
| Non-persistent | Temporary | Discarded on close |
| `--persistent` | `~/.agent-browser-ff/profiles/<name>/` | Survives restarts |

```bash
agent-browser-ff session new work --persistent
agent-browser-ff open https://example.com --session work
agent-browser-ff session list
agent-browser-ff session close work
```

## Storage state

`state save <file>` and `state load <file>` write and read Playwright storage-state JSON (cookies and localStorage).

:::danger
State files contain live session cookies. Keep them out of version control and delete them when done.
:::

## Headless and headed

The daemon owns one Browser per launch mode. Switching between headless and `--gui` relaunches Firefox, saving and restoring storage state and the current URL, so the session carries over.

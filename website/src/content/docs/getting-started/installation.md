---
title: Installation
description: Install the CLI, the Firefox build, and the agent skill.
---

## Requirements

- Node.js 20 or newer
- macOS, Linux, or Windows
- For `--gui` on Linux: a display (`DISPLAY` or `WAYLAND_DISPLAY`)

## Install the CLI

```bash
npm install -g agent-browser-ff
agent-browser-ff install        # downloads Playwright's Firefox build
agent-browser-ff --version
```

## Install the agent skill

```bash
npx skills add CatastrophistUser/agent-browser-ff --skill agent-browser-ff -g
```

The skill tells the agent to run `agent-browser-ff --version` first and gives install steps if the command is missing.

## Where things live

| Path | Contents |
| --- | --- |
| `~/.agent-browser-ff/run/daemon.sock` | Daemon socket, mode `0600` |
| `~/.agent-browser-ff/logs/daemon.log` | Daemon log |
| `~/.agent-browser-ff/macros/<name>.yaml` | Saved macros |
| `~/.agent-browser-ff/profiles/<name>/` | Persistent session profiles |
| `./.agent-browser-ff/artifacts/` | Screenshots, videos, HAR files, scrape output |
| `./.agent-browser-ff/downloads/` | Downloaded files, never opened or executed |

Artifact and download folders are relative to the directory you run the command in.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `AGENT_BROWSER_FF_VAULT_PASSPHRASE` | Vault passphrase when no OS keychain is available |

## Build from source

```bash
pnpm install
pnpm exec playwright install firefox
pnpm build
node dist/cli.js --help
```

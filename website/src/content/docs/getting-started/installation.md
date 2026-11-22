---
title: Installation
description: Install the CLI, the Firefox build, and the agent skill.
---

## Requirements

- Node.js 20 or newer
- macOS, Linux, or Windows
- For `--gui` on Linux: a display (`DISPLAY` or `WAYLAND_DISPLAY`)

## Install the CLI and the agent skill

```bash
npm install -g agent-browser-ff
agent-browser-ff setup
```

`npm install -g` installs the CLI and puts `agent-browser-ff` on your PATH. `setup` then finishes the job:

| Step | What `setup` does |
| --- | --- |
| PATH check | Confirms `agent-browser-ff` resolves. If not, prints the folder to add and the line to put in your shell profile |
| Firefox | Downloads Playwright's Firefox build |
| Agent skill | Asks "Install the agent skill?" and, on yes, runs the skills installer, which lets you pick the coding agents |
| Summary | Lists what succeeded, was skipped, or failed |

```bash
agent-browser-ff setup --yes            # no questions, install the skill
agent-browser-ff setup --no-skill       # CLI and Firefox only
agent-browser-ff setup --skip-firefox   # skip the Firefox download
```

When there is no terminal (a script or CI), `setup` does not ask. It skips the skill unless you pass `--yes`.

The skill step needs **Node.js 22.20 or newer**, because the skills installer requires it. On an older Node, the PATH check and Firefox download still run, and the summary says what to upgrade.

### Install the skill on its own

```bash
npx skills add CatastrophistUser/agent-browser-ff --skill agent-browser-ff -g
```

Start a new agent session afterwards, because agents load skills when they start.

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

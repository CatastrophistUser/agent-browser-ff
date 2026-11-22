---
title: Introduction
description: What agent-browser-ff is and how it fits together.
---

agent-browser-ff is a browser automation CLI for AI agents and humans, built on Firefox. It is a Firefox-first alternative to agent-browser and playwright-cli.

A long-lived **daemon** owns the browser, so page state (current URL, cookies, tabs) survives between separate shell commands. Each CLI call is a thin client: it sends one JSON-RPC request to the daemon, prints a short result, and exits with a meaningful exit code.

It also ships an **Agent Skill** that teaches coding agents (Claude Code, Codex, Cursor and others) how to drive the CLI.

## Capabilities

| Area | What you get |
| --- | --- |
| Browse | Open and test pages in Firefox, headless by default |
| Watch | `--gui` runs headed with an on-page overlay so a human can follow along |
| Act | Short, token-efficient element refs (`@e1`) instead of brittle selectors |
| Record | A macro recorder, plus macros built from CLI history, replayed with variables |
| Scrape | Schema-based extraction, pagination and crawling, including dynamic pages |
| Authenticate | Named sessions, persistent profiles, storage state, and an encrypted vault with TOTP |
| Inspect | Screenshots, video, console, and network/HAR capture |

## Non-goals

- Firefox only. No Chromium or WebKit, no CDP code paths.
- No cloud browser providers.

## Architecture at a glance

| Piece | Role |
| --- | --- |
| CLI | Parses a command, ensures the daemon is running, sends one request, prints the result |
| Daemon | Owns one Playwright Browser per launch mode and one BrowserContext per session |
| Socket | JSON-RPC 2.0 over a Unix domain socket (named pipe on Windows), never TCP |
| Skill | `SKILL.md` plus references that teach agents the commands |

The daemon shuts itself down after an idle timeout (default 15 minutes) and logs to `~/.agent-browser-ff/logs/daemon.log`. Logs never contain secrets.

## Where to go next

- [Installation](/getting-started/installation/) and [Quickstart](/getting-started/quickstart/)
- [Refs and snapshots](/concepts/refs-and-snapshots/), the core idea
- [Command reference](/commands/launch/) for every command and flag
- [Using with agents](/guides/agents/) to install the skill

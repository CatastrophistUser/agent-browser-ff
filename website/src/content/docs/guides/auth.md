---
title: Sessions and auth
description: Persistent profiles, storage state, the encrypted vault and TOTP.
---

## Sessions

```bash
agent-browser-ff session new <name> [--persistent]
agent-browser-ff session list
agent-browser-ff session use <name>
agent-browser-ff session close <name>
```

Pass `--session <name>` on any command to target a session without switching. See [Daemon and sessions](/concepts/daemon-and-sessions/).

## Storage state

```bash
agent-browser-ff state save auth.json
agent-browser-ff state load auth.json
```

:::danger
State files contain live cookies. Treat them as secrets, keep them out of git, and delete them when finished.
:::

## Vault

Credentials are encrypted at rest. The vault key is held in the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux). Without a keychain, a passphrase-derived key (scrypt) is used, prompted on a TTY or read from `AGENT_BROWSER_FF_VAULT_PASSPHRASE`.

```bash
agent-browser-ff vault add <key> [--username <u>] [--totp]
agent-browser-ff vault list
agent-browser-ff vault remove <key>
agent-browser-ff vault fill <ref> <key>.username|<key>.password|<key>.totp
```

| Rule | Detail |
| --- | --- |
| No argv secrets | `vault add` reads the password from stdin or a TTY prompt, never from arguments |
| Quiet fills | `vault fill` prints only `filled <key>.password into @eN` |
| TOTP | `<key>.totp` generates the current code from a stored seed |
| Errors | Vault problems exit with code 7 |

Secrets never appear in stdout, `--json` output, logs, error messages, macro files, history, or screenshots of password fields.

## A login flow

```bash
agent-browser-ff session new work --persistent
agent-browser-ff open https://example.com/login --session work
agent-browser-ff snapshot --session work
agent-browser-ff vault fill @e2 example.username --session work
agent-browser-ff vault fill @e3 example.password --session work
agent-browser-ff click @e4 --session work
```

## Turn it into a macro

Capture the flow, then reuse it:

```bash
agent-browser-ff macro from-history example-login --last 6
agent-browser-ff login example --macro example-login
```

Login macro variables are named `username`, `password` and `totp`. `macro from-history` produces exactly those when you used `vault fill`, so `login` works without edits.

## Limits

Use agent-browser-ff only on sites and accounts you are authorized to access. If a CAPTCHA or bot check blocks a site you do not own, stop rather than trying to defeat it.

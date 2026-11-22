# Sessions and auth

## Sessions

A session is a named browser context with its own cookies and storage.

```
agent-browser-ff session new <name> [--persistent]
agent-browser-ff session list
agent-browser-ff session use <name>
agent-browser-ff session close <name>
```

- Non-persistent sessions use a temporary profile that is discarded on close.
- `--persistent` stores the profile at `~/.agent-browser-ff/profiles/<name>/`.
- Pass `--session <name>` on any command to target a session without switching.

## Storage state

```
agent-browser-ff state save <file>
agent-browser-ff state load <file>
```

Saves/loads cookies and localStorage (Playwright storage-state JSON). **These files contain live session cookies.** Warn the user, keep them out of version control, and delete them when done.

## Vault

Credentials are encrypted at rest. The key is held in the OS keychain (macOS Keychain, Windows Credential Manager, libsecret), with a passphrase-derived fallback when no keychain exists.

```
agent-browser-ff vault add <key> [--username <u>]    # password read from stdin or a TTY prompt
agent-browser-ff vault list
agent-browser-ff vault remove <key>
agent-browser-ff vault fill <ref> <key>.username|<key>.password|<key>.totp
agent-browser-ff login <key> --macro <macro-name>
```

Rules:

- **Never pass a password on the command line.** `vault add` reads it from stdin or a prompt; if the user has not stored the credential, ask them to run `vault add` themselves.
- `vault fill` prints only `filled <key>.password into @eN`. Secrets never appear in output, logs, macros, history, or screenshots of password fields.
- `<key>.totp` generates the current one-time code from a stored seed.
- Vault problems exit with code 7.
- Login macro variables are named `username`, `password`, `totp`; `macro from-history` produces exactly those when you used `vault fill`, so `agent-browser-ff login <key> --macro <name>` works without edits.
- Without an OS keychain the vault uses a passphrase (prompted on a TTY, or `AGENT_BROWSER_FF_VAULT_PASSPHRASE`).

## Typical login flow

```bash
agent-browser-ff session new work --persistent
agent-browser-ff open https://example.com/login --session work
agent-browser-ff snapshot --session work
agent-browser-ff vault fill @e2 example.username --session work
agent-browser-ff vault fill @e3 example.password --session work
agent-browser-ff click @e4 --session work
```

Once it works, capture it as a macro with `macro from-history` and reuse it with `agent-browser-ff login example --macro example-login`.

## Limits

agent-browser-ff is for sites and accounts the user is authorized to access. If a CAPTCHA or bot check blocks a site the user does not own, stop and tell the user rather than trying to defeat it.

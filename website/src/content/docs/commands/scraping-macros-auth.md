---
title: Scrape, macro and auth commands
description: Compact syntax listing for scrape, crawl, macro, session, state, vault and login.
---

Details live in the guides: [Scraping](/guides/scraping/), [Macros](/guides/macros/), [Sessions and auth](/guides/auth/).

## Scraping

```bash
agent-browser-ff scrape --schema <schema.json|yaml> [--paginate-next <selector>] [--max-pages <n>] [--out <file>] [--format json|jsonl|csv]
agent-browser-ff crawl <start-url> --match <url-glob> --schema <file> [--max-pages <n>] [--concurrency <n>] [--delay <ms>] [--ignore-robots] [--out <file>] [--format json|jsonl|csv]
```

## Macros

```bash
agent-browser-ff macro record <name> [--gui]
agent-browser-ff macro stop
agent-browser-ff macro list
agent-browser-ff macro show <name>
agent-browser-ff macro play <name> [--var key=value]... [--gui] [--speed <x>] [--step]
agent-browser-ff macro edit <name>
agent-browser-ff macro delete <name>
agent-browser-ff macro from-history <name> [--last <n>]
```

## Sessions and state

```bash
agent-browser-ff session new <name> [--persistent]
agent-browser-ff session list
agent-browser-ff session use <name>
agent-browser-ff session close <name>
agent-browser-ff state save <file>
agent-browser-ff state load <file>
```

## Vault and login

```bash
agent-browser-ff vault add <key> [--username <u>] [--totp]
agent-browser-ff vault list
agent-browser-ff vault remove <key>
agent-browser-ff vault fill <ref> <key>.username|<key>.password|<key>.totp
agent-browser-ff login <key> --macro <macro-name>
```

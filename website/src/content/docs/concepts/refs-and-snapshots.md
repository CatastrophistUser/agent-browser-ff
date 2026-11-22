---
title: Refs and snapshots
description: How agents address elements with short refs.
---

Agents act on elements through short refs such as `@e1`, not raw selectors.

## Snapshots

`agent-browser-ff snapshot` builds a compact, accessibility-style tree of the page and assigns refs to interactive and text-bearing elements.

- One line per element, indentation for nesting.
- Long text is truncated and invisible elements are omitted, so output stays cheap in tokens.
- Iframes and shadow DOM appear nested; use their refs as normal.

| Flag | Effect |
| --- | --- |
| `--full` | Complete tree, including elements the compact view hides |
| `--selector <sel>` | Snapshot only a subtree |

## How a ref resolves

Each ref maps internally to a stable Playwright locator. The priority order is:

1. role + accessible name
2. `data-testid`
3. label or placeholder
4. text
5. CSS (last resort)

## Generations and stale refs

Refs belong to a **snapshot generation**. Any navigation or major DOM change bumps the generation.

Using a ref from an older generation returns `E_STALE_REF` (exit 4) with a hint to re-run `snapshot`. agent-browser-ff never silently retargets a stale ref.

:::caution
After clicking a link or submitting a form, always re-run `snapshot`. Forgetting this is the most common error.
:::

## Raw selectors

For scripting, commands also accept prefixed selectors:

| Prefix | Example |
| --- | --- |
| `css=` | `css=a.next` |
| `text=` | `text=Sign in` |
| `role=` | `role=button` |

Agents should prefer refs. Use selectors for scripts and for `scrape` schemas.

## Overlay exclusion

The `--gui` overlay is excluded from snapshots, screenshots (unless `--with-overlay`), and scraped data.

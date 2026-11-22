---
title: Scraping
description: Schemas, pagination and crawling.
---

## One page or a paginated list

```bash
agent-browser-ff open https://example.com/products
agent-browser-ff scrape --schema products.yaml --paginate-next "css=a.next" --max-pages 10 --out products.json --format json
```

## Schema format

A schema has a root item selector and named fields. Each field has a selector and an extractor.

| Extractor | Returns |
| --- | --- |
| `text` | Visible text |
| `attr:<name>` | An attribute, e.g. `attr:href` |
| `html` | Inner HTML |
| `js:<expression>` | Result of a JavaScript expression |

```yaml
item: "css=.product-card"
dedupe: url
fields:
  title: { selector: "h2", extract: text }
  url:   { selector: "a", extract: "attr:href" }
  price: { selector: ".price", extract: text }
  tags:
    item: ".tag"
    fields:
      name: { extract: text }
```

| Key | Meaning |
| --- | --- |
| `item` | Root selector, one result per match |
| `dedupe` | Field used as the dedupe key |
| `fields` | Named fields. A field with its own `item` is a nested list |

JSON schemas are also accepted. Schemas are validated before running.

## Pagination

Follows the "next" target until it is missing, disabled, or `--max-pages` is reached. Items are deduplicated by the configured key. For infinite scroll, loop `scroll page --to bottom` with `wait networkidle`.

## Crawl

```bash
agent-browser-ff crawl https://example.com --match "https://example.com/products/*" --schema product.yaml --max-pages 50 --concurrency 2 --delay 1000
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--match <glob>` | required | Only follow URLs matching the glob |
| `--max-pages <n>` | none | Upper bound |
| `--concurrency <n>` | 2 | Parallel pages |
| `--delay <ms>` | 1000 | Per-domain delay |
| `--ignore-robots` | off | Skip robots.txt, with a warning |

The crawl is breadth-first and respects `robots.txt` by default. Do not raise rate limits against sites you do not own.

## Output

| Mode | Behaviour |
| --- | --- |
| `--out <file>` | Writes results and prints the path. Formats: `json`, `jsonl`, `csv` |
| No `--out` | Prints at most 50 items and the count omitted |

## Tips

- Run `snapshot` first to choose stable selectors. Prefer `data-testid` and roles over long class chains.
- For dynamic content, `wait networkidle` or `wait selector` before scraping.
- Overlay and GUI badges are excluded from scraped data.

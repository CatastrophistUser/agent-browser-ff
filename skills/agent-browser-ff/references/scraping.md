# Scraping

## Single page or paginated list

```bash
agent-browser-ff open https://example.com/products
agent-browser-ff scrape --schema products.yaml --paginate-next "css=a.next" --max-pages 10 --out products.json --format json
```

## Schema format

A schema has a root item selector and named fields. Each field has a selector and an extractor.

Extractors: `text`, `attr:<name>`, `html`, `js:<expression>`.

```yaml
item: "css=.product-card"
dedupe: url            # field name used as the dedupe key
fields:
  title: { selector: "h2", extract: text }
  url:   { selector: "a", extract: "attr:href" }
  price: { selector: ".price", extract: text }
  tags:                # nested list
    item: ".tag"
    fields:
      name: { extract: text }
```

JSON is also accepted. Schemas are validated before running; fix reported errors and retry.

## Pagination

Follows the "next" target until it is missing, disabled, or `--max-pages` is reached. Items are deduplicated by the configured key. For infinite scroll, use `scroll page --to bottom` plus `wait networkidle` in a loop, or the `paginate` command.

## Crawl

```bash
agent-browser-ff crawl https://example.com --match "https://example.com/products/*" --schema product.yaml --max-pages 50 --concurrency 2 --delay 1000
```

- Breadth-first within `--match` globs, bounded by `--max-pages`.
- Respects robots.txt by default. `--ignore-robots` overrides with a warning; use it only when the user explicitly asks and owns or is authorized for the site.
- Defaults: 1000 ms delay per domain, concurrency 2. Do not raise them against sites you do not own.

## Output

- With `--out`, results are written to the file and the path is printed. Formats: `json`, `jsonl`, `csv`.
- Without `--out`, at most 50 items are printed and the count of omitted items is reported. Use `--out` for anything larger.

## Tips

- Run `snapshot` first to pick stable selectors; prefer `data-testid` and roles over brittle class chains.
- Dynamic content: `wait networkidle` or `wait selector` before scraping.
- Overlay and GUI badges are excluded from scraped data.

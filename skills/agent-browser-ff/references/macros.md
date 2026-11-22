# Macros

A macro is a saved, parameterized sequence of steps. Stored at `~/.agent-browser-ff/macros/<name>.yaml`.

## Creating macros

- **From history (preferred for agents)**: perform the flow with normal commands, then
  `agent-browser-ff macro from-history <name> --last <n>` converts the last N CLI actions.
- **Live recording**: `agent-browser-ff macro record <name> --gui`, let the human perform the flow, then `agent-browser-ff macro stop`. File uploads are not recorded (the path is unknown); add them by hand with `macro edit`.

Use `macro show <name>` to review the result and `macro edit <name>` to adjust it.

## Normalization (automatic)

- Consecutive keystrokes merge into one `fill`.
- Redundant focus/click pairs collapse.
- Each target gets a stable locator plus a fallback.
- Implicit waits are inserted after navigations (`wait load`) and before interactions (visible and enabled).
- Password field values are never recorded. They become a vault reference or a `{{variable}}` placeholder, with a warning.

## File format

```yaml
name: search-and-open-first
version: 1
vars:
  query: { required: true }
steps:
  - goto: https://example.com
  - fill: { target: { role: searchbox, name: Search }, value: "{{query}}" }
  - press: Enter
  - wait: networkidle
  - click: { target: { role: link, nth: 0 }, fallback: { css: "a.result" } }
  - assert: { target: { role: heading, level: 1 }, state: visible }
```

- `vars` declares parameters; reference them as `{{name}}`.
- Do not change the format without bumping `version`; migrations live in the CLI.

## Replay

```bash
agent-browser-ff macro play search-and-open-first --var query="firefox automation"
agent-browser-ff macro play <name> --gui --step      # pause before each step, press Enter (stdin)
agent-browser-ff macro play <name> --speed 2         # scale recorded delays
```

Each target is resolved with the primary locator, then the fallback. If both fail, replay stops with `E_MACRO_STEP_FAILED`, reports the step index, and saves a screenshot to the artifacts directory. Open the screenshot, fix the step with `macro edit`, and replay.

## Secrets

Never hard-code passwords in a macro. Use `{{variable}}` or a vault reference, and run with `agent-browser-ff login <key> --macro <macro-name>` to combine a vault entry with a login macro. See [auth.md](auth.md).

# Changelog

All notable changes to **Stringly i18n Key Copier** will be documented here.

## [0.1.0] — 2026-02-24

### Added
- **Copy i18n Key Path** (`Alt+Shift+C` / right-click) — copies the full dot-notation key path for the key or value under the cursor.
- **Copy i18n Key Path (Object Notation)** (right-click) — copies bracket-notation path, e.g. `root["nested"]["key"]`.
- **Copy i18n Key Path (with Context)** (`Alt+Shift+X` / right-click) — detects i18next context keys (`baseKey_contextValue`) and shows a quick-pick to copy the base key, a `t()` call with `{ context }`, or the full literal key. Only shown when the base key exists as a real string leaf in the file. i18next plural suffixes (`one`, `other`, `zero`, `few`, `many`, `two` and ordinal variants) are never treated as context values.
- **Live status bar** — shows the current key path as the cursor moves; click to copy. Debounced at 80 ms to avoid unnecessary work on rapid cursor movement.
- **Per-document JSON cache** — parsed JSON is cached by document version so navigation never re-parses the file on every keystroke.
- Settings: `separator`, `showStatusBar`, `includeArrayIndices`, `pluralSuffixes`.

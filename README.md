# Stringly i18n Key Copier

Copy the full key path for any translation key in a JSON i18n file — just like copying an XPath in the browser DevTools.

## Features

### Copy Key Path — dot notation
Place the cursor on any key **or** its value and press `Alt+Shift+C`.

```json
"contractInjectionHub": {
  "injectionHubConfigurationsCard": {
    "deleteFacilityModal": {
      "description": "Are you sure..."
    }
  }
}
```

Copied:
```
contractInjectionHub.injectionHubConfigurationsCard.deleteFacilityModal.description
```

### Copy Key Path — bracket notation
Right-click → **Copy i18n Key Path (Object Notation)**:
```
contractInjectionHub["injectionHubConfigurationsCard"]["deleteFacilityModal"]["description"]
```

### Copy Key Path — with Context (`Alt+Shift+X`)
Detects [i18next context keys](https://www.i18next.com/translation-function/context) automatically.

```json
"fieldKey": "{{context}}",
"fieldKey_parcelSortingCapacity": "Parcel Sorting Capacity"
```

Press `Alt+Shift+X` on `fieldKey_parcelSortingCapacity` and a quick-pick appears:

```
🔑 Base key only
   contractInjectionHub.injectionHubConfigurationsTable.fieldKey

{} Base key + context call
   t('contractInjectionHub.injectionHubConfigurationsTable.fieldKey', { context: 'parcelSortingCapacity' })

≡  Full literal key
   contractInjectionHub.injectionHubConfigurationsTable.fieldKey_parcelSortingCapacity
```

The quick-pick only appears when:
- The last segment contains `_`
- The suffix is **not** an i18next plural suffix (`one`, `other`, `zero`, `few`, `many`, `two`, and ordinal variants)
- The base key (`fieldKey`) exists as a real string leaf in the file

On keys without context (`configName`, `title`, …) the full key is copied directly — no picker.

### Live Status Bar
The current key path updates as you move the cursor. **Click to copy immediately.**

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Copy dot-notation path | `Alt+Shift+C` |
| Copy with context quick-pick | `Alt+Shift+X` |

## Context Menu (right-click in any JSON file)

- **Copy i18n Key Path**
- **Copy i18n Key Path (Object Notation)**
- **Copy i18n Key Path (with Context)**

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `stringly-i18n.separator` | `"."` | Separator between key segments |
| `stringly-i18n.showStatusBar` | `true` | Show/hide the status bar key path indicator |
| `stringly-i18n.includeArrayIndices` | `false` | Include numeric indices for JSON array paths |
| `stringly-i18n.pluralSuffixes` | `[]` | Extra suffixes to treat as plural variants and exclude from context detection |

## Development

```bash
npm install
npm run watch        # incremental compile (TypeScript watch)
# Press F5 → opens Extension Development Host
npm run lint         # ESLint
npm run package      # produces a .vsix file
```

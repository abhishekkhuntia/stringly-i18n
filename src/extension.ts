import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedDocumentCache {
  version: number;
  json: Record<string, unknown> | null;
}

type PickItem = vscode.QuickPickItem & { value: string };

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * i18next built-in plural suffixes.
 * Keys ending with these are pluralisation variants, NOT context keys —
 * we never show the context quick-pick for them.
 */
const BUILTIN_PLURAL_SUFFIXES = new Set([
  'zero', 'one', 'two', 'few', 'many', 'other',
  'ordinal_zero', 'ordinal_one', 'ordinal_two',
  'ordinal_few', 'ordinal_many', 'ordinal_other',
]);

// ─── State ───────────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let statusBarDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Per-document parsed-JSON cache keyed by document URI string. */
const documentCache = new Map<string, ParsedDocumentCache>();

// ─── JSON Cache ───────────────────────────────────────────────────────────────

function getParsedJson(document: vscode.TextDocument): Record<string, unknown> | null {
  const key = document.uri.toString();
  const cached = documentCache.get(key);

  if (cached?.version === document.version) {
    return cached.json;
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(document.getText()) as Record<string, unknown>;
  } catch {
    // Silently tolerate invalid / partially-typed JSON
  }

  documentCache.set(key, { version: document.version, json });
  return json;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isJsonDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'json' || document.languageId === 'jsonc';
}

function getSeparator(): string {
  return vscode.workspace.getConfiguration('stringly-i18n').get<string>('separator') ?? '.';
}

/**
 * Resolves the full dot-notation key path for the JSON token under the cursor.
 * Returns null if the cursor is not inside a JSON property.
 */
function resolveKeyPath(document: vscode.TextDocument, position: vscode.Position): string | null {
  const separator = getSeparator();
  const includeArrayIndices =
    vscode.workspace.getConfiguration('stringly-i18n').get<boolean>('includeArrayIndices') ?? false;

  try {
    const location = jsonc.getLocation(document.getText(), document.offsetAt(position));
    const segments = location.path;

    if (segments.length === 0) {
      return null;
    }

    const parts = segments
      .filter((s) => typeof s === 'string' || includeArrayIndices)
      .map(String);

    return parts.length > 0 ? parts.join(separator) : null;
  } catch {
    return null;
  }
}

/**
 * Returns an object-notation key path, e.g.
 *   contractInjectionHub["injectionHubConfigurationsCard"]["description"]
 */
function resolveKeyPathObjectNotation(document: vscode.TextDocument, position: vscode.Position): string | null {
  const includeArrayIndices =
    vscode.workspace.getConfiguration('stringly-i18n').get<boolean>('includeArrayIndices') ?? false;

  try {
    const location = jsonc.getLocation(document.getText(), document.offsetAt(position));
    const segments = location.path;

    if (segments.length === 0) {
      return null;
    }

    return segments
      .filter((s) => typeof s === 'string' || includeArrayIndices)
      .reduce<string>((acc, segment, index) => {
        if (typeof segment === 'number') {
          return `${acc}[${segment}]`;
        }
        return index === 0 ? String(segment) : `${acc}["${segment}"]`;
      }, '');
  } catch {
    return null;
  }
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

/** Debounced wrapper — avoids redundant parses on rapid cursor movement. */
function scheduleStatusBarUpdate(): void {
  if (statusBarDebounceTimer !== undefined) {
    clearTimeout(statusBarDebounceTimer);
  }
  statusBarDebounceTimer = setTimeout(updateStatusBar, 80);
}

function updateStatusBar(): void {
  statusBarDebounceTimer = undefined;

  if (!(vscode.workspace.getConfiguration('stringly-i18n').get<boolean>('showStatusBar') ?? true)) {
    statusBarItem.hide();
    return;
  }

  const editor = vscode.window.activeTextEditor;

  if (!editor || !isJsonDocument(editor.document)) {
    statusBarItem.hide();
    return;
  }

  const keyPath = resolveKeyPath(editor.document, editor.selection.active);

  if (!keyPath) {
    statusBarItem.hide();
    return;
  }

  const maxLen = 60;
  const display = keyPath.length > maxLen ? `…${keyPath.slice(-(maxLen - 1))}` : keyPath;
  statusBarItem.text = `$(key) ${display}`;
  statusBarItem.tooltip = new vscode.MarkdownString(
    `**i18n key**\n\n\`${keyPath}\`\n\n_Click to copy_`,
  );
  statusBarItem.show();
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function commandCopyKeyPath(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonDocument(editor.document)) {
    vscode.window.showWarningMessage('Open a JSON file and place the cursor on a key first.');
    return;
  }

  const keyPath = resolveKeyPath(editor.document, editor.selection.active);
  if (!keyPath) {
    vscode.window.showWarningMessage('Could not resolve a key path at the cursor position.');
    return;
  }

  await vscode.env.clipboard.writeText(keyPath);
  vscode.window.showInformationMessage(`Copied: ${keyPath}`);
}

async function commandCopyKeyPathAsObject(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonDocument(editor.document)) {
    vscode.window.showWarningMessage('Open a JSON file and place the cursor on a key first.');
    return;
  }

  const keyPath = resolveKeyPathObjectNotation(editor.document, editor.selection.active);
  if (!keyPath) {
    vscode.window.showWarningMessage('Could not resolve a key path at the cursor position.');
    return;
  }

  await vscode.env.clipboard.writeText(keyPath);
  vscode.window.showInformationMessage(`Copied: ${keyPath}`);
}

// ─── Context Key Helpers ─────────────────────────────────────────────────────

/**
 * Returns true when `basePath` resolves to a **string leaf** in the document.
 * Uses the per-document JSON cache so repeated calls during a single keystroke
 * do not re-parse the file.
 */
function baseKeyExistsAsLeaf(
  basePath: string,
  document: vscode.TextDocument,
): boolean {
  const json = getParsedJson(document);
  if (!json) {
    return false;
  }

  const separator = getSeparator();
  let current: unknown = json;

  for (const segment of basePath.split(separator)) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !(segment in (current as Record<string, unknown>))
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  // Must be a string leaf, not a nested object
  return typeof current === 'string';
}

/**
 * Tries to split the last path segment at the first `_` into a base key and a
 * context value. Returns null (no quick-pick) when:
 *   - there is no `_` in the last segment
 *   - the suffix is an i18next plural suffix (one/other/zero/few/many/two …)
 *   - the suffix is in the user-configured `pluralSuffixes` exclusion list
 *   - the derived base key does NOT exist as a string leaf in the document
 */
function splitContextKey(
  fullPath: string,
  document: vscode.TextDocument,
): { basePath: string; context: string } | null {
  const separator = getSeparator();
  const segments = fullPath.split(separator);
  const lastSegment = segments[segments.length - 1];
  const underscoreIndex = lastSegment.indexOf('_');

  if (underscoreIndex === -1) {
    return null;
  }

  const baseKey = lastSegment.substring(0, underscoreIndex);
  const context = lastSegment.substring(underscoreIndex + 1);

  // Exclude built-in and user-configured plural suffixes
  const customPluralSuffixes =
    vscode.workspace.getConfiguration('stringly-i18n').get<string[]>('pluralSuffixes') ?? [];
  const allPluralSuffixes = new Set([...BUILTIN_PLURAL_SUFFIXES, ...customPluralSuffixes]);

  if (allPluralSuffixes.has(context)) {
    return null;
  }

  const basePath = [...segments.slice(0, -1), baseKey].join(separator);

  if (!baseKeyExistsAsLeaf(basePath, document)) {
    return null;
  }

  return { basePath, context };
}

async function commandCopyKeyPathWithContext(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isJsonDocument(editor.document)) {
    vscode.window.showWarningMessage('Open a JSON file and place the cursor on a key first.');
    return;
  }

  const keyPath = resolveKeyPath(editor.document, editor.selection.active);
  if (!keyPath) {
    vscode.window.showWarningMessage('Could not resolve a key path at the cursor position.');
    return;
  }

  const split = splitContextKey(keyPath, editor.document);

  if (!split) {
    // No context pattern — copy the full path directly, no picker needed
    await vscode.env.clipboard.writeText(keyPath);
    vscode.window.showInformationMessage(`Copied: ${keyPath}`);
    return;
  }

  const options: PickItem[] = [
    {
      label: '$(key) Base key only',
      description: split.basePath,
      value: split.basePath,
    },
    {
      label: '$(symbol-object) Base key + context call',
      description: `t('${split.basePath}', { context: '${split.context}' })`,
      value: `t('${split.basePath}', { context: '${split.context}' })`,
    },
    {
      label: '$(list-flat) Full literal key',
      description: keyPath,
      value: keyPath,
    },
  ];

  const picked = (await vscode.window.showQuickPick(options, {
    placeHolder: `Context key detected: "${split.context}" — choose what to copy`,
    matchOnDescription: true,
  })) as PickItem | undefined;

  if (picked) {
    await vscode.env.clipboard.writeText(picked.value);
    vscode.window.showInformationMessage(`Copied: ${picked.value}`);
  }
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'stringly-i18n.copyKeyPath';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('stringly-i18n.copyKeyPath', commandCopyKeyPath),
    vscode.commands.registerCommand('stringly-i18n.copyKeyPathAsObject', commandCopyKeyPathAsObject),
    vscode.commands.registerCommand('stringly-i18n.copyKeyPathWithContext', commandCopyKeyPathWithContext),
  );

  context.subscriptions.push(
    // Debounced status bar updates
    vscode.window.onDidChangeTextEditorSelection(scheduleStatusBarUpdate),
    vscode.window.onDidChangeActiveTextEditor(scheduleStatusBarUpdate),
    vscode.workspace.onDidChangeConfiguration(scheduleStatusBarUpdate),
    // Evict cache entries so stale JSON is never used
    vscode.workspace.onDidCloseTextDocument((doc) =>
      documentCache.delete(doc.uri.toString()),
    ),
    vscode.workspace.onDidChangeTextDocument((e) =>
      documentCache.delete(e.document.uri.toString()),
    ),
  );

  updateStatusBar();
}

export function deactivate(): void {
  if (statusBarDebounceTimer !== undefined) {
    clearTimeout(statusBarDebounceTimer);
  }
  documentCache.clear();
  statusBarItem?.dispose();
}

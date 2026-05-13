"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// ─── Constants ────────────────────────────────────────────────────────────────
const CONFIG_SECTION = "fileCommander";
const DEFAULT_ALLOWED_EXTENSIONS = [".java", ".cs"];
const DEFAULT_COMMANDS = [
    {
        id: "editor.action.organizeImports",
        label: "Organize Imports",
        description: "Sort and remove unused imports",
    },
    {
        id: "editor.action.formatDocument",
        label: "Format Document",
        description: "Apply the code formatter to the file",
    },
];
// ─── Activation ───────────────────────────────────────────────────────────────
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("fileCommander.runOnFile", async (uri) => {
        await runOnFile(uri);
    }), vscode.commands.registerCommand("fileCommander.runOnFolder", async (uri) => {
        await runOnFolder(uri);
    }));
}
function deactivate() { }
// ─── Settings ─────────────────────────────────────────────────────────────────
function getSettings() {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const rawExtensions = cfg.get("allowedExtensions");
    const allowedExtensions = normalizeExtensions(Array.isArray(rawExtensions) ? rawExtensions : DEFAULT_ALLOWED_EXTENSIONS);
    const rawCommands = cfg.get("commands");
    const commands = validateCommands(Array.isArray(rawCommands) && rawCommands.length > 0
        ? rawCommands
        : DEFAULT_COMMANDS);
    return {
        allowedExtensions,
        commands,
        saveAfterCommands: cfg.get("saveAfterCommands") ?? true,
        closeAfterProcessing: cfg.get("closeAfterProcessing") ?? true,
    };
}
/**
 * Ensures every extension starts with "." and is lowercase.
 * Filters out empty or non-string entries.
 */
function normalizeExtensions(exts) {
    return exts
        .filter((e) => typeof e === "string" && e.trim() !== "")
        .map((e) => {
        const trimmed = e.trim().toLowerCase();
        return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    });
}
/**
 * Removes commands missing a valid "id" field and fills in a label fallback.
 */
function validateCommands(cmds) {
    if (!Array.isArray(cmds)) {
        return [];
    }
    return cmds
        .filter((c) => c !== null &&
        typeof c === "object" &&
        typeof c.id === "string" &&
        c.id.trim() !== "")
        .map((c) => ({
        id: c.id.trim(),
        label: typeof c.label === "string" && c.label.trim() !== ""
            ? c.label.trim()
            : c.id.trim(),
        description: typeof c.description === "string" && c.description.trim() !== ""
            ? c.description.trim()
            : undefined,
    }));
}
// ─── Run on Single File ───────────────────────────────────────────────────────
/**
 * Right-click → Run Command on File.
 *
 * Flow:
 *  1. Resolve the target URI (falls back to the active editor).
 *  2. Check the file extension is in the allowed list.
 *  3. Present a single-command picker.
 *  4. Execute the command, save if needed, close if not previously open.
 */
async function runOnFile(uri) {
    const resolvedUri = resolveFileUri(uri);
    if (!resolvedUri) {
        vscode.window.showErrorMessage("fileCommander: No file is selected and no editor is active.");
        return;
    }
    const settings = getSettings();
    const ext = path.extname(resolvedUri.fsPath).toLowerCase();
    if (settings.allowedExtensions.length > 0 &&
        !settings.allowedExtensions.includes(ext)) {
        const allowed = settings.allowedExtensions.join(", ");
        const action = await vscode.window.showWarningMessage(`fileCommander: "${ext}" is not in the allowed extensions list (${allowed}).`, "Open Settings");
        if (action === "Open Settings") {
            await vscode.commands.executeCommand("workbench.action.openSettings", "fileCommander.allowedExtensions");
        }
        return;
    }
    if (settings.commands.length === 0) {
        const action = await vscode.window.showWarningMessage("fileCommander: No commands are configured.", "Open Settings");
        if (action === "Open Settings") {
            await vscode.commands.executeCommand("workbench.action.openSettings", "fileCommander.commands");
        }
        return;
    }
    const items = settings.commands.map((c) => ({
        label: c.label,
        description: c.description,
        detail: `Command ID: ${c.id}`,
        command: c,
    }));
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a command to run on this file",
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true,
    });
    if (!selected) {
        return;
    }
    const openPaths = snapshotOpenFilePaths();
    const wasAlreadyOpen = openPaths.has(resolvedUri.fsPath);
    const ok = await processFile(resolvedUri, [selected.command], settings.saveAfterCommands, !wasAlreadyOpen && settings.closeAfterProcessing);
    if (ok) {
        vscode.window.showInformationMessage(`fileCommander: "${selected.command.label}" applied to ${path.basename(resolvedUri.fsPath)}.`);
    }
    else {
        vscode.window.showErrorMessage(`fileCommander: One or more errors occurred while processing "${path.basename(resolvedUri.fsPath)}". Check the Output panel for details.`);
    }
}
/**
 * Returns the URI from the context menu, or falls back to the active editor.
 */
function resolveFileUri(uri) {
    if (uri?.fsPath && uri.fsPath.trim() !== "") {
        return uri;
    }
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.fsPath && activeUri.fsPath.trim() !== "") {
        return activeUri;
    }
    return undefined;
}
// ─── Run on Folder ────────────────────────────────────────────────────────────
/**
 * Right-click → Run Commands on Folder.
 *
 * Flow:
 *  1. Discover all files in the folder (excluding node_modules / .git).
 *  2. Step 1/2 — Extension picker (multi-select, shows file count per ext).
 *  3. Step 2/2 — Command picker in order (sequential until Done).
 *  4. Confirmation modal before touching any files.
 *  5. Cancellable progress notification.
 */
async function runOnFolder(uri) {
    if (!uri?.fsPath || uri.fsPath.trim() === "") {
        vscode.window.showErrorMessage("fileCommander: No folder is selected.");
        return;
    }
    const settings = getSettings();
    if (settings.commands.length === 0) {
        const action = await vscode.window.showWarningMessage("fileCommander: No commands are configured.", "Open Settings");
        if (action === "Open Settings") {
            await vscode.commands.executeCommand("workbench.action.openSettings", "fileCommander.commands");
        }
        return;
    }
    // Discover files
    const allFiles = await discoverFiles(uri);
    if (allFiles.length === 0) {
        vscode.window.showInformationMessage("fileCommander: No files found in the selected folder.");
        return;
    }
    // ── Step 1: Pick extensions ──────────────────────────────────────────────────
    const availableExtensions = getUniqueExtensions(allFiles);
    if (availableExtensions.length === 0) {
        vscode.window.showInformationMessage("fileCommander: No files with extensions found in the selected folder.");
        return;
    }
    const extensionItems = availableExtensions.map((ext) => ({
        label: ext,
        picked: false,
        description: pluralise(allFiles.filter((f) => path.extname(f.fsPath).toLowerCase() === ext)
            .length, "file"),
    }));
    const selectedExtItems = await vscode.window.showQuickPick(extensionItems, {
        canPickMany: true,
        placeHolder: "Step 1/2 — Select the file extensions to process",
        ignoreFocusOut: true,
    });
    if (!selectedExtItems || selectedExtItems.length === 0) {
        return;
    }
    const selectedExtensions = new Set(selectedExtItems.map((i) => i.label));
    // ── Step 2: Pick commands in order ───────────────────────────────────────────
    const commandsToRun = await pickCommandsInOrder(settings.commands);
    if (commandsToRun.length === 0) {
        return;
    }
    // Filter files to those with selected extensions
    const filesToProcess = allFiles.filter((f) => {
        const ext = path.extname(f.fsPath).toLowerCase();
        return ext !== "" && selectedExtensions.has(ext);
    });
    if (filesToProcess.length === 0) {
        vscode.window.showInformationMessage("fileCommander: No files matched the selected extensions.");
        return;
    }
    // ── Confirmation ─────────────────────────────────────────────────────────────
    const commandChain = commandsToRun.map((c) => c.label).join(" → ");
    const confirmed = await vscode.window.showInformationMessage(`fileCommander: Run "${commandChain}" on ${pluralise(filesToProcess.length, "file")}?`, { modal: true }, "Run");
    if (confirmed !== "Run") {
        return;
    }
    // ── Process with progress ─────────────────────────────────────────────────────
    const openPaths = snapshotOpenFilePaths();
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `fileCommander: ${commandChain}`,
        cancellable: true,
    }, async (progress, token) => {
        const total = filesToProcess.length;
        let processed = 0;
        let errors = 0;
        for (const fileUri of filesToProcess) {
            if (token.isCancellationRequested) {
                vscode.window.showInformationMessage(`fileCommander: Cancelled after processing ${pluralise(processed, "file")}.`);
                return;
            }
            progress.report({
                message: `(${processed + 1}/${total}) ${path.basename(fileUri.fsPath)}`,
                increment: (1 / total) * 100,
            });
            const wasAlreadyOpen = openPaths.has(fileUri.fsPath);
            const ok = await processFile(fileUri, commandsToRun, settings.saveAfterCommands, !wasAlreadyOpen && settings.closeAfterProcessing);
            if (ok) {
                processed++;
            }
            else {
                errors++;
            }
        }
        const base = `fileCommander: Processed ${pluralise(processed, "file")}`;
        if (errors > 0) {
            vscode.window.showWarningMessage(`${base} with ${pluralise(errors, "error")}. Check the Output panel for details.`);
        }
        else {
            vscode.window.showInformationMessage(`${base} successfully.`);
        }
    });
}
/**
 * Presents commands one at a time so the user can build an ordered sequence.
 * The "Done" item at the top always shows the current queue.
 * Returns [] if the user escapes or cancels before picking anything.
 */
async function pickCommandsInOrder(commands) {
    const selected = [];
    const pool = [...commands];
    while (pool.length > 0) {
        const doneItem = {
            label: selected.length === 0
                ? "$(circle-slash) Cancel"
                : `$(check) Done  —  ${selected.map((c) => c.label).join(" → ")}`,
            description: selected.length === 0 ? "Pick at least one command first" : undefined,
            command: null,
            alwaysShow: true,
        };
        const commandItems = pool.map((c) => ({
            label: c.label,
            description: c.description,
            detail: `ID: ${c.id}`,
            command: c,
        }));
        const placeHolder = selected.length === 0
            ? "Step 2/2 — Pick the first command to run"
            : `Step 2/2 — Queue: ${selected.map((c) => c.label).join(" → ")}  —  pick next or Done`;
        const pick = await vscode.window.showQuickPick([doneItem, ...commandItems], {
            placeHolder,
            matchOnDescription: true,
            ignoreFocusOut: true,
        });
        if (!pick) {
            return []; // Escape pressed
        }
        if (pick.command === null) {
            return selected; // Done (empty = cancel)
        }
        selected.push(pick.command);
        const idx = pool.indexOf(pick.command);
        if (idx !== -1) {
            pool.splice(idx, 1);
        }
        if (pool.length === 0) {
            break;
        }
    }
    return selected;
}
// ─── File Discovery ───────────────────────────────────────────────────────────
/**
 * Returns all files under folderUri, excluding common noise directories.
 */
async function discoverFiles(folderUri) {
    const includePattern = new vscode.RelativePattern(folderUri, "**/*");
    const excludePattern = new vscode.RelativePattern(folderUri, "{**/node_modules/**,**/.git/**,**/out/**,**/.vscode-test/**}");
    let raw = [];
    try {
        raw = await vscode.workspace.findFiles(includePattern, excludePattern);
    }
    catch (err) {
        console.error("fileCommander: Error discovering files:", err instanceof Error ? err.message : String(err));
        return [];
    }
    const seen = new Set();
    return raw.filter((u) => {
        if (!u?.fsPath || u.fsPath.trim() === "") {
            return false;
        }
        if (seen.has(u.fsPath)) {
            return false;
        }
        seen.add(u.fsPath);
        return true;
    });
}
/** Returns a sorted array of unique lowercase extensions present in the file list. */
function getUniqueExtensions(files) {
    const exts = new Set();
    for (const file of files) {
        const ext = path.extname(file.fsPath).toLowerCase();
        if (ext !== "") {
            exts.add(ext);
        }
    }
    return Array.from(exts).sort();
}
// ─── File Processing ──────────────────────────────────────────────────────────
/**
 * Opens a file, runs each command in sequence, optionally saves, and optionally
 * closes the editor. Returns true when all steps succeed, false otherwise.
 */
async function processFile(uri, commands, save, closeAfter) {
    if (!uri || commands.length === 0) {
        return false;
    }
    let document;
    try {
        document = await vscode.workspace.openTextDocument(uri);
    }
    catch (err) {
        console.error(`fileCommander: Could not open "${uri.fsPath}":`, err instanceof Error ? err.message : String(err));
        return false;
    }
    let editor;
    try {
        editor = await vscode.window.showTextDocument(document, {
            preserveFocus: false,
            preview: true,
        });
    }
    catch (err) {
        console.error(`fileCommander: Could not show editor for "${uri.fsPath}":`, err instanceof Error ? err.message : String(err));
        return false;
    }
    if (!editor) {
        console.error(`fileCommander: showTextDocument returned no editor for "${uri.fsPath}"`);
        return false;
    }
    let allSucceeded = true;
    for (const cmd of commands) {
        try {
            await vscode.commands.executeCommand(cmd.id);
            await delay(300);
        }
        catch (err) {
            console.error(`fileCommander: Command "${cmd.id}" failed on "${uri.fsPath}":`, err instanceof Error ? err.message : String(err));
            allSucceeded = false;
            // Continue with remaining commands rather than aborting
        }
    }
    if (save && document.isDirty) {
        try {
            const saved = await document.save();
            if (!saved) {
                console.warn(`fileCommander: document.save() returned false for "${uri.fsPath}"`);
                allSucceeded = false;
            }
        }
        catch (err) {
            console.error(`fileCommander: Save failed for "${uri.fsPath}":`, err instanceof Error ? err.message : String(err));
            allSucceeded = false;
        }
    }
    if (closeAfter) {
        try {
            await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        }
        catch (err) {
            // Best-effort cleanup — not fatal
            console.warn(`fileCommander: Could not close editor for "${uri.fsPath}":`, err instanceof Error ? err.message : String(err));
        }
    }
    return allSucceeded;
}
// ─── Utilities ────────────────────────────────────────────────────────────────
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Captures fsPath strings for every file currently open in any editor tab group.
 * Silently returns an empty set on older VS Code versions without tabGroups.
 */
function snapshotOpenFilePaths() {
    const result = new Set();
    try {
        const tabGroups = vscode.window.tabGroups;
        if (tabGroups && Array.isArray(tabGroups.all)) {
            for (const group of tabGroups.all) {
                for (const tab of group.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        result.add(tab.input.uri.fsPath);
                    }
                }
            }
        }
    }
    catch {
        // Older VS Code — no tabGroups API
    }
    return result;
}
/** Returns "1 file" / "3 files", "1 error" / "2 errors", etc. */
function pluralise(n, noun) {
    return `${n} ${noun}${n !== 1 ? "s" : ""}`;
}
//# sourceMappingURL=extension.js.map
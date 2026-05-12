"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) {
          k2 = k;
        }
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) {
          k2 = k;
        }
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)) {
              ar[ar.length] = k;
            }
          }
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) {
        return mod;
      }
      var result = {};
      if (mod !== null) {
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) {
          if (k[i] !== "default") {
            __createBinding(result, mod, k[i]);
          }
        }
      }
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));

const ALWAYS_EXCLUDED_FOLDERS = [".git"];
/**
 * Default value for commandOnAllFiles.excludeFolders when not configured.
 * Matches the spec-documented default.
 */
const DEFAULT_EXCLUDED_FOLDERS = [
  "node_modules",
  "out",
  ".vscode-test",
  "media",
  ".git",
];
const CONFIG_SECTION = "commandOnAllFiles";

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "workspace-formatter.formatAll",
      async () => {
        await formatWorkspaceFiles();
      },
    ),
    vscode.commands.registerCommand(
      "workspace-formatter.formatFolder",
      async (uri) => {
        if (!uri?.fsPath) {
          vscode.window.showErrorMessage("Invalid folder selection.");
          return;
        }
        await formatFolderFiles(uri);
      },
    ),

    vscode.commands.registerCommand(
      "commandOnAllFiles.applyOnWorkspace",
      async (args) => {
        await applyOnWorkspace(args);
      },
    ),
  );
}
function deactivate() {}

function getGlobalConfig() {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const rawExclude = cfg.get("excludeFolders") ?? DEFAULT_EXCLUDED_FOLDERS;
  return {
    includeFileExtensions: cfg.get("includeFileExtensions") ?? [],
    includeFiles: cfg.get("includeFiles") ?? undefined,
    excludeFiles: cfg.get("excludeFiles") ?? undefined,
    excludeFolders: ensureAlwaysExcluded(rawExclude),
    includeFolders: cfg.get("includeFolders") ?? undefined,
    saveFiles: cfg.get("saveFiles") ?? true,
    commands: cfg.get("commands") ?? {},
  };
}
/**
 * Returns a copy of the array that always includes every entry from
 * ALWAYS_EXCLUDED_FOLDERS (e.g. ".git"), deduplicated.
 */
function ensureAlwaysExcluded(folders) {
  const set = new Set(folders);
  for (const f of ALWAYS_EXCLUDED_FOLDERS) {
    set.add(f);
  }
  return Array.from(set);
}
/**
 * Merges a CommandDefinition with the global config, applying any per-command
 * overrides. Returns undefined if the key is not found.
 */
function resolveCommandConfig(commandKey, global) {
  const def = global.commands[commandKey];
  if (!def) {
    return undefined;
  }

  const resolvedExclude =
    def.excludeFolders !== undefined
      ? ensureAlwaysExcluded(def.excludeFolders)
      : global.excludeFolders;
  return {
    commandId: def.command,
    includeFileExtensions:
      def.includeFileExtensions ?? global.includeFileExtensions,
    includeFiles: def.includeFiles ?? global.includeFiles,
    excludeFiles: def.excludeFiles ?? global.excludeFiles,
    excludeFolders: resolvedExclude,
    includeFolders: def.includeFolders ?? global.includeFolders,
    saveFiles: def.saveFiles ?? global.saveFiles,
  };
}

async function applyOnWorkspace(args) {
  const globalConfig = getGlobalConfig();

  let commandKey;
  if (Array.isArray(args) && args.length > 0 && typeof args[0] === "string") {
    commandKey = args[0];
    if (!globalConfig.commands[commandKey]) {
      vscode.window.showErrorMessage(
        `commandOnAllFiles: Unknown command key "${commandKey}". ` +
          `Check the commandOnAllFiles.commands setting.`,
      );
      return;
    }
  } else {
    const keys = Object.keys(globalConfig.commands);
    if (keys.length === 0) {
      vscode.window.showWarningMessage(
        "commandOnAllFiles: No commands configured. " +
          "Add entries to commandOnAllFiles.commands in your settings.json.",
      );
      return;
    }
    const items = keys.map((key) => {
      const def = globalConfig.commands[key];
      return {
        commandKey: key,
        label: def.label ?? key,
        description: def.description,
        detail: def.detail,
      };
    });
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a command to apply to all workspace files",
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: false,
    });
    if (!selected) {
      return;
    }
    commandKey = selected.commandKey;
  }

  const resolved = resolveCommandConfig(commandKey, globalConfig);
  if (!resolved) {
    vscode.window.showErrorMessage(
      `commandOnAllFiles: Failed to resolve config for "${commandKey}".`,
    );
    return;
  }
  if (
    typeof resolved.commandId !== "string" ||
    resolved.commandId.trim() === ""
  ) {
    vscode.window.showErrorMessage(
      `commandOnAllFiles: The entry for "${commandKey}" is missing ` +
        `a valid "command" property.`,
    );
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      "commandOnAllFiles: No workspace folder is open.",
    );
    return;
  }

  const preExistingOpenPaths = snapshotOpenFilePaths();

  const allFiles = await gatherWorkspaceFiles(workspaceFolders, resolved);
  if (allFiles.length === 0) {
    vscode.window.showInformationMessage(
      "commandOnAllFiles: No files matched the configured criteria.",
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `commandOnAllFiles: Applying "${commandKey}"`,
      cancellable: true,
    },
    async (progress, token) => {
      const total = allFiles.length;
      let processed = 0;
      let errors = 0;
      for (const fileUri of allFiles) {
        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage(
            `commandOnAllFiles: Cancelled after ${processed} of ${total} file${total !== 1 ? "s" : ""}.`,
          );
          return;
        }
        progress.report({
          message: `(${processed + 1}/${total}) ${path.basename(fileUri.fsPath)}`,
          increment: (1 / total) * 100,
        });
        const wasAlreadyOpen = preExistingOpenPaths.has(fileUri.fsPath);
        const ok = await processFileSingle(
          fileUri,
          resolved.commandId,
          resolved.saveFiles,
          wasAlreadyOpen,
        );
        if (ok) {
          processed++;
        } else {
          errors++;
        }
      }
      const base = `commandOnAllFiles: Processed ${processed} file${processed !== 1 ? "s" : ""}`;
      vscode.window.showInformationMessage(
        errors > 0
          ? `${base} with ${errors} error${errors !== 1 ? "s" : ""}. Check the Output panel for details.`
          : `${base} successfully.`,
      );
    },
  );
}

/**
 * Collects all matching URIs across every workspace folder.
 * Workspace folders whose name appears in excludeFolders are skipped entirely
 * (enables excluding specific roots in a Multi Root Workspace).
 */
async function gatherWorkspaceFiles(workspaceFolders, config) {
  const uris = [];
  for (const folder of workspaceFolders) {
    if (config.excludeFolders.includes(folder.name)) {
      continue;
    }
    const folderUris = await gatherFilesFromFolder(folder, config);
    uris.push(...folderUris);
  }

  const seen = new Set();
  return uris.filter((u) => {
    if (seen.has(u.fsPath)) {
      return false;
    }
    seen.add(u.fsPath);
    return true;
  });
}
/**
 * Finds all files inside one workspace folder that pass every configured filter.
 *
 * Filter order (each step can reject a file):
 *   1. excludeFolders — belt-and-suspenders check in addition to the findFiles glob.
 *   2. excludeFiles   — regex deny-list.
 *   3. includeFiles   — regex allow-list (overrides includeFileExtensions when set).
 *      OR includeFileExtensions — extension allow-list (empty = include all).
 *   4. includeFolders — glob patterns that the file's directory must satisfy.
 */
async function gatherFilesFromFolder(folder, config) {
  const excludeGlob = buildExcludeGlobString(config.excludeFolders);
  const rawFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*"),
    excludeGlob ? new vscode.RelativePattern(folder, excludeGlob) : undefined,
  );
  const result = [];
  for (const file of rawFiles) {
    if (!file || typeof file.fsPath !== "string") {
      continue;
    }

    const relativePath = toForwardSlashes(
      path.relative(folder.uri.fsPath, file.fsPath),
    );

    const matchPath = `/${folder.name}/${relativePath}`;

    if (isInExcludedFolderSegment(relativePath, config.excludeFolders)) {
      continue;
    }

    if (
      config.excludeFiles &&
      config.excludeFiles.length > 0 &&
      matchesAnyRegex(matchPath, config.excludeFiles)
    ) {
      continue;
    }

    if (config.includeFiles !== undefined && config.includeFiles.length > 0) {
      if (!matchesAnyRegex(matchPath, config.includeFiles)) {
        continue;
      }
    } else if (config.includeFileExtensions.length > 0) {
      const ext = path.extname(file.fsPath);
      if (!config.includeFileExtensions.includes(ext)) {
        continue;
      }
    }

    if (
      config.includeFolders !== undefined &&
      config.includeFolders.length > 0
    ) {
      if (!matchesAnyFolderPattern(matchPath, config.includeFolders)) {
        continue;
      }
    }
    result.push(file);
  }
  return result;
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, "/");
}
/**
 * Returns true when any directory *segment* in the relative path exactly
 * matches an entry in excludeFolders.
 *
 * e.g. "node_modules/lodash/index.js" → excluded if "node_modules" is listed.
 * e.g. "src/node_modules_extra/foo.ts" → NOT excluded (different segment name).
 */
function isInExcludedFolderSegment(relativePath, excludeFolders) {
  const segments = relativePath.split("/");

  for (let i = 0; i < segments.length - 1; i++) {
    if (excludeFolders.includes(segments[i])) {
      return true;
    }
  }
  return false;
}
/**
 * Tests matchPath against every pattern in the array.
 * Returns true on the first match.
 * Silently skips patterns whose regex string is invalid.
 *
 * Flag sanitisation: only letters present in /[gimsuy]/ are forwarded to
 * RegExp; anything else is stripped so a malformed flags string can't throw.
 */
function matchesAnyRegex(matchPath, patterns) {
  for (const pattern of patterns) {
    if (!pattern || typeof pattern.regex !== "string") {
      continue;
    }
    try {
      const safeFlags =
        typeof pattern.flags === "string"
          ? pattern.flags.replace(/[^gimsuy]/g, "")
          : "";
      const re = new RegExp(pattern.regex, safeFlags);
      if (re.test(matchPath)) {
        return true;
      }
    } catch (err) {
      console.warn(
        `commandOnAllFiles: Skipping invalid regex "${pattern.regex}": ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  return false;
}
/**
 * Tests whether a file's directory path satisfies at least one includeFolders
 * glob pattern.
 *
 * matchPath is "/workspaceName/src/components/App.tsx".
 * The directory portion extracted is "/workspaceName/src/components/".
 *
 * Patterns like "/src/" are tested as substrings for the common (no-wildcard)
 * case; patterns with glob metacharacters are converted to a RegExp.
 *
 * The spec notes: "There is no need to use ** at the start of the Glob Pattern."
 * Using "/src/" prevents accidental matches on "src-test/" because the leading
 * slash anchors the name to a directory boundary.
 */
function matchesAnyFolderPattern(matchPath, patterns) {
  const lastSlash = matchPath.lastIndexOf("/");
  const dirPath = lastSlash >= 0 ? matchPath.substring(0, lastSlash + 1) : "/";
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || pattern.trim() === "") {
      continue;
    }
    try {
      if (folderPatternMatches(dirPath, pattern)) {
        return true;
      }
    } catch (err) {
      console.warn(
        `commandOnAllFiles: Skipping invalid includeFolders pattern "${pattern}": ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  return false;
}
/**
 * Checks a single glob pattern against a directory path.
 *
 * Fast path: if the pattern has no glob metacharacters, use a simple
 * substring check — this correctly handles the spec example where "/src/"
 * must NOT match "/src-test/" because "-src-test" lacks the leading slash.
 *
 * Slow path: convert the glob to a RegExp and test.
 */
function folderPatternMatches(dirPath, pattern) {
  const norm = toForwardSlashes(pattern);

  if (!/[*?[\]]/.test(norm)) {
    return dirPath.includes(norm);
  }

  let globForRegex;
  if (norm.startsWith("**/")) {
    globForRegex = norm;
  } else if (norm.startsWith("/")) {
    globForRegex = "**" + norm;
  } else {
    globForRegex = "**/" + norm;
  }
  const regexStr = globToRegexString(globForRegex);

  const re = new RegExp(regexStr);
  return re.test(dirPath);
}
function globToRegexString(glob) {
  let result = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (i + 1 < glob.length && glob[i + 1] === "*") {
        if (i + 2 < glob.length && glob[i + 2] === "/") {
          result += "(?:.*/)?";
          i += 3;
        } else {
          result += ".*";
          i += 2;
        }
      } else {
        result += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      result += "[^/]";
      i++;
    } else if (c === "[") {
      const closeIdx = glob.indexOf("]", i + 1);
      if (closeIdx !== -1) {
        result += glob.substring(i, closeIdx + 1);
        i = closeIdx + 1;
      } else {
        result += "\\[";
        i++;
      }
    } else if (c === "/") {
      result += "\\/";
      i++;
    } else if (".^$|+(){}\\".includes(c)) {
      result += "\\" + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  return result;
}
/**
 * Builds a single exclude-glob string suitable for vscode.workspace.findFiles.
 *
 * e.g. ["node_modules", ".git"] → "{**\/node_modules\/**,**\/.git\/**}"
 * Single entry → "**\/node_modules\/**" (no braces needed).
 */
function buildExcludeGlobString(excludeFolders) {
  if (!excludeFolders || excludeFolders.length === 0) {
    return undefined;
  }
  const globs = excludeFolders.map((f) => `**/${f}/**`);
  return globs.length === 1 ? globs[0] : `{${globs.join(",")}}`;
}

/**
 * Returns the set of fsPath strings for all files currently open in editor
 * tabs. Uses vscode.window.tabGroups (stable since VS Code 1.65).
 *
 * Falls back silently to an empty set on older VS Code versions so the
 * extension still works — files opened during processing will then be closed
 * as per the original spec description.
 */
function snapshotOpenFilePaths() {
  const result = new Set();
  try {
    const tabGroups = vscode.window.tabGroups;
    if (tabGroups && typeof tabGroups.all !== "undefined") {
      for (const group of tabGroups.all) {
        for (const tab of group.tabs) {
          if (tab.input instanceof vscode.TabInputText) {
            result.add(tab.input.uri.fsPath);
          }
        }
      }
    }
  } catch {}
  return result;
}

/**
 * Opens a file, executes the configured VS Code command, and — depending on
 * saveFiles and whether the file was already open — saves and/or closes it.
 *
 * @param uri             The target file.
 * @param commandId       VS Code command ID to execute with the file active.
 * @param saveFiles       When true: save (if dirty) and close (unless pre-existing).
 *                        When false: leave the file open as-is (modified or not).
 * @param wasAlreadyOpen  If true the file was open before processing started;
 *                        it will be saved if dirty but never closed.
 * @returns               true on success, false if an error occurred.
 */
async function processFileSingle(uri, commandId, saveFiles, wasAlreadyOpen) {
  if (!uri) {
    return false;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    if (!document) {
      return false;
    }
    const editor = await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: true,
    });
    if (!editor) {
      return false;
    }

    await vscode.commands.executeCommand(commandId);
    if (saveFiles) {
      if (document.isDirty) {
        const saved = await document.save();
        if (!saved) {
          console.warn(
            `commandOnAllFiles: document.save() returned false for "${uri.fsPath}"`,
          );
        }
      }

      if (!wasAlreadyOpen) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
      }
    }

    return true;
  } catch (err) {
    console.error(
      `commandOnAllFiles: Error processing "${uri.fsPath}":`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * Scans a designated folder for all files, dynamically extracts available
 * file extensions, prompts the user to select the desired extensions, and
 * processes the matching files.
 */
async function formatFolderFiles(folderUri) {
  if (
    !folderUri ||
    typeof folderUri.fsPath !== "string" ||
    folderUri.fsPath.trim() === ""
  ) {
    return;
  }
  const folderPattern = new vscode.RelativePattern(folderUri, "**/*.*");
  const files = await vscode.workspace.findFiles(
    folderPattern,
    "**/node_modules/**",
  );
  if (!files || files.length === 0) {
    vscode.window.showInformationMessage(
      "No files found in the selected folder.",
    );
    return;
  }
  const extensions = new Set();
  for (const file of files) {
    if (!file || typeof file.fsPath !== "string") {
      continue;
    }
    const lastDotIndex = file.fsPath.lastIndexOf(".");
    if (lastDotIndex > 0 && lastDotIndex < file.fsPath.length - 1) {
      extensions.add(file.fsPath.substring(lastDotIndex + 1));
    }
  }
  if (extensions.size === 0) {
    vscode.window.showInformationMessage(
      "No formattable file types found in the selected folder.",
    );
    return;
  }
  const extensionItems = Array.from(extensions).map((ext) => ({
    label: `.${ext}`,
    picked: true,
  }));
  const selectedItems = await vscode.window.showQuickPick(extensionItems, {
    canPickMany: true,
    placeHolder: "Select the file types to format",
    ignoreFocusOut: true,
  });
  if (!selectedItems || selectedItems.length === 0) {
    return;
  }
  const selectedExtensions = new Set(
    selectedItems.map((item) => item.label.substring(1)),
  );
  const filesToFormat = files.filter((file) => {
    if (!file || typeof file.fsPath !== "string") {
      return false;
    }
    const lastDotIndex = file.fsPath.lastIndexOf(".");
    return (
      lastDotIndex > 0 &&
      selectedExtensions.has(file.fsPath.substring(lastDotIndex + 1))
    );
  });
  if (!filesToFormat || filesToFormat.length === 0) {
    return;
  }
  for (const file of filesToFormat) {
    await processFileCommands(file, [
      "editor.action.organizeImports",
      "editor.action.formatDocument",
    ]);
  }
  vscode.window.showInformationMessage(
    `Successfully processed ${filesToFormat.length} files in the folder.`,
  );
}
/**
 * Orchestrates the formatting process across all supported files in the
 * current workspace. Uses sequential processing to prevent memory exhaustion.
 */
async function formatWorkspaceFiles() {
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,js,json,java,py,cpp,cs}",
    "**/node_modules/**",
  );
  if (!files || files.length === 0) {
    return;
  }
  for (const file of files) {
    await processFileCommands(file, ["editor.action.formatDocument"]);
  }
  vscode.window.showInformationMessage(
    `Successfully processed ${files.length} files.`,
  );
}
/**
 * Opens a file, executes an array of commands sequentially, saves if dirty,
 * then closes the editor.
 */
async function processFileCommands(uri, commands) {
  if (!uri || !commands || commands.length === 0) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    if (!document) {
      return;
    }
    const editor = await vscode.window.showTextDocument(document, {
      preserveFocus: false,
      preview: true,
    });
    if (!editor) {
      return;
    }
    for (const command of commands) {
      if (typeof command === "string" && command.trim() !== "") {
        await vscode.commands.executeCommand(command);
      }
    }
    if (document.isDirty) {
      await document.save();
    }
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  } catch (error) {
    console.error(error);
  }
}

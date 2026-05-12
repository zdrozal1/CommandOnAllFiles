import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const formatWorkspaceDisposable = vscode.commands.registerCommand(
    "workspace-formatter.formatAll",
    async () => {
      await formatWorkspaceFiles();
    },
  );

  const formatFolderDisposable = vscode.commands.registerCommand(
    "workspace-formatter.formatFolder",
    async (uri: vscode.Uri) => {
      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage("Invalid folder selection.");
        return;
      }
      await formatFolderFiles(uri);
    },
  );

  context.subscriptions.push(formatWorkspaceDisposable, formatFolderDisposable);
}

/**
 * Scans a designated folder for all files, dynamically extracts available file extensions,
 * prompts the user to select the desired extensions, and processes the matching files.
 *
 * @param folderUri The file system URI of the selected folder.
 * @returns A promise that resolves when all selected files have been processed.
 */
async function formatFolderFiles(folderUri: vscode.Uri): Promise<void> {
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

  const extensions = new Set<string>();

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
 * Orchestrates the formatting process across all supported files in the current workspace.
 * Uses a sequential processing pattern to prevent memory exhaustion in large projects.
 *
 * @returns A promise that resolves when all files have been processed.
 */
async function formatWorkspaceFiles(): Promise<void> {
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
 * Opens a specific file, brings it into active focus, and sequentially executes an array of designated commands.
 * Includes safety checks to ensure the document is valid and modified before attempting to save.
 *
 * @param uri The file system URI of the target document.
 * @param commands An array of command identifiers to execute.
 * @returns A promise that resolves after the command executions, file save, and tab closure.
 */
async function processFileCommands(
  uri: vscode.Uri,
  commands: string[],
): Promise<void> {
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

export function deactivate(): void {}

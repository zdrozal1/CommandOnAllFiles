# File Commander

A streamlined VS Code extension that allows you to execute highly customizable VS Code commands on individual files or an entire folder of files.

Built with performance in mind, this extension sequentially processes files to prevent memory exhaustion, automatically saves modified files, and cleans up after itself by closing any editor tabs it had to open during execution (while preserving tabs you already had open).

## Features

- **Context Menu Integration:** Easily right-click a file or folder in the VS Code Explorer to trigger your custom commands.
- **Dynamic Folder Scanning:** When running on a folder, the extension automatically detects all available file types inside and prompts you to select exactly which extensions you want to target.
- **Sequential Command Execution:** Queue up multiple VS Code commands (e.g., organize imports, then format document) to run in a specific order across an entire folder.
- **Allowed Extensions Protection:** Prevent accidental runs on unsupported files by defining an allowed list of file extensions for single-file execution.
- **Workspace Cleanup:** Automatically closes editor tabs after processing to prevent excessive open tabs, leaving your originally open files completely untouched.

## Commands

### File Commander: Run Command on File (`fileCommander.runOnFile`)

Right-click a file in the Explorer and select this command to process it.

1. The extension verifies that the file's extension is allowed in your `fileCommander.allowedExtensions` setting.
2. A QuickPick menu appears, allowing you to choose a single custom command to execute.
3. The file is processed, saved, and closed (depending on your configuration).

### File Commander: Run Commands on Folder (`fileCommander.runOnFolder`)

Right-click a folder in the Explorer and select this command to process its contents.

1. The extension scans the folder (ignoring `node_modules` and `.git`) and discovers all available file extensions.
2. A multi-select menu prompts you to choose which file types you want to process.
3. A sequential QuickPick menu allows you to queue multiple commands in a specific order.
4. After a confirmation prompt, the extension processes all matching files sequentially with a progress bar.

## Extension Settings

Customize the extension's behavior in your `settings.json` file.

- **`fileCommander.allowedExtensions`**: An array of file extensions that are allowed to be processed when using the "Run on File" command.
  - _Default:_ `[".java", ".cs"]`
  - _Example:_ `[".ts", ".js", ".java", ".json"]`

- **`fileCommander.commands`**: An array of custom command configurations available in the pickers.
  - **`id`**: (String) The exact VS Code command ID to execute (e.g., `"editor.action.formatDocument"`).
  - **`label`**: (String) The display name shown in the command picker. Supports VS Code icon syntax.
  - **`description`**: (String, Optional) Additional subtitle text shown under the label.

- **`fileCommander.saveAfterCommands`**: (Boolean) Save each file after all commands have run (only if the document was modified).
  - _Default:_ `true`

- **`fileCommander.closeAfterProcessing`**: (Boolean) Close editor tabs that were **not already open** before processing started.
  - _Default:_ `true`

## Example Configuration

Add the following to your `settings.json` to configure your allowed file types and set up a few useful commands:

```json
{
  "fileCommander.allowedExtensions": [".java", ".cs", ".ts", ".js"],
  "fileCommander.saveAfterCommands": true,
  "fileCommander.closeAfterProcessing": true,
  "fileCommander.commands": [
    {
      "id": "editor.action.organizeImports",
      "label": "$(symbol-namespace) Organize Imports",
      "description": "Sort and remove unused imports"
    },
    {
      "id": "editor.action.formatDocument",
      "label": "$(file-code) Format Document",
      "description": "Apply the code formatter to the file"
    },
    {
      "id": "editor.action.fixAll",
      "label": "$(wrench) Fix All Auto-Fixable Problems",
      "description": "Runs ESLint/Prettier auto-fixes"
    }
  ]
}
```

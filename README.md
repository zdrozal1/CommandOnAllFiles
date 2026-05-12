# Workspace Formatter & Command on All Files

A VS Code extension to quickly format your entire workspace or specific folders, and to sequentially apply any VS Code command to all files in a Workspace based on deeply customizable filter criteria.

## Commands

### Workspace Formatter Commands

**Workspace Formatter: Format All Workspace Files** (`workspace-formatter.formatAll`)
Scans the entire workspace for supported files (`.ts`, `.js`, `.json`, `.java`, `.py`, `.cpp`, `.cs`), ignoring `node_modules`, and sequentially applies the `editor.action.formatDocument` command to each.

**Workspace Formatter: Format All Files in Folder** (`workspace-formatter.formatFolder`)
Scans a specific folder and dynamically prompts you to select which of the detected file extensions you want to process. Applies both `editor.action.organizeImports` and `editor.action.formatDocument` to the matching files.
_Note: You can access this command directly by right-clicking a folder in the Explorer context menu._

### Command on All Files Commands

**CommandOnAllFiles: Apply to Workspace** (`commandOnAllFiles.applyOnWorkspace`)
Applies a configured command to all files in the (Multi Root) Workspace. It accepts an argument array where the first element is a key from the `commandOnAllFiles.commands` setting.

When called from the command palette without an argument, a QuickPick list of configured commands is shown for you to select.

The command will:

1. Open all files in an editor that meet the configuration criteria. (If the file is already open, it preserves the tab).
2. Apply the specified command ID to the document.
3. Save the file.
4. Close the editor, unless the file was already actively open in your workspace prior to the execution.

## Extension Settings

- **`commandOnAllFiles.includeFileExtensions`**: Only files with file extensions in this list will be processed. Example `[".html", ".css", ".js"]`. Defaults to `[]`.
- **`commandOnAllFiles.includeFiles`**: List of regular expressions of file paths to include. Overrides `includeFileExtensions`. Each list element is an object with:
  - `regex`: string with a regular expression that is searched in the file path (separator `/`). The file path searched is: `/workspace_name/relative_file_path`.
  - `flags`: flags to use with the property regex (e.g. `i`). Default `""`.
- **`commandOnAllFiles.excludeFiles`**: List of regular expressions of file paths to exclude. Follows the same structure as `includeFiles`.
- **`commandOnAllFiles.excludeFolders`**: These folders will be skipped when looking for files to process. Can contain workspacefolder (base)names to exclude certain Multi Root Workspaces. Defaults to `["node_modules", "out", ".vscode-test", "media", ".git"]`. _(Note: `.git` is automatically appended to prevent accidental repository corruption)._
- **`commandOnAllFiles.includeFolders`**: An array of Glob Patterns describing folders that will determine which files will be processed. There is no need to use `**` at the start of the Glob Pattern. To prevent an incorrect directory match, always include the separator `/` (e.g. `["/src/"]`).
- **`commandOnAllFiles.saveFiles`**: If `true` save and close a modified file. If `false` keep a modified file open in the editor. Defaults to `true`.
- **`commandOnAllFiles.commands`**: An object with key/value items describing the commands to use. The key is the description of a command. The value is an object with the property `command` for the commandID to apply together with possible overrides:
  - `command`: The VS Code command ID to execute.
  - `includeFileExtensions`, `includeFiles`, `excludeFiles`, `excludeFolders`, `includeFolders`, `saveFiles`: Overrides global settings if defined.
  - `label`, `description`, `detail`: Used to construct the QuickPick item when called from the command palette.

## Example Configuration

This example uses the `multiCommand` extension to chain multiple actions, applying a "Hello" append to all `.txt` files in a workspace.

**In `settings.json`:**

```json
  "multiCommand.commands": [
    {
      "command": "multiCommand.addHelloAtEnd",
      "sequence": [
        "cursorBottom",
        { "command": "type",
          "args": { "text": "Hello" }
        }
      ]
    }
  ],
  "commandOnAllFiles.commands": {
    "Add Hello to the End": {
      "command": "multiCommand.addHelloAtEnd",
      "includeFileExtensions": [".txt"]
    }
  }
```

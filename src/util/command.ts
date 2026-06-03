import * as vscode from "vscode";
import { compareFileUris, FileExt, readFile, writeFile } from "./file";
import { itemStates } from "../tree/treeConstants";

export type Subscription = { dispose(): any };

const findInFilesOptions = {
  triggerSearch: true,
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false,
} as const;

export const registerCommands = (
  subscriptions: Subscription[],
  commands: Record<string, (...args: any[]) => any>,
) => {
  for (const [command, callback] of Object.entries(commands)) {
    subscriptions.push(
      vscode.commands.registerCommand(
        `siebelscriptandwebtempeditor.${command}`,
        callback,
      ),
    );
  }
};

export const compareObjects = async (
  content: string | undefined,
  ext: FileExt,
  fileUri: vscode.Uri,
  compareMessage: string,
) => {
  if (content === undefined) return itemStates.differ;
  const fileContent = await readFile(fileUri);
  await writeFile(compareFileUris[ext], content);
  await vscode.commands.executeCommand(
    "vscode.diff",
    compareFileUris[ext],
    fileUri,
    compareMessage,
  );
  return content === fileContent ? itemStates.same : itemStates.differ;
};

export const searchInFiles = async (folderUri: vscode.Uri, query = "") => {
  await vscode.commands.executeCommand("workbench.action.findInFiles", {
    query,
    filesToInclude: folderUri.fsPath,
    ...findInFilesOptions,
  });
};

export const setButtonVisibility = (visibility: Record<string, boolean>) => {
  for (const [button, isEnabled] of Object.entries(visibility)) {
    vscode.commands.executeCommand(
      "setContext",
      `siebelscriptandwebtempeditor.${button}Enabled`,
      isEnabled,
    );
  }
};
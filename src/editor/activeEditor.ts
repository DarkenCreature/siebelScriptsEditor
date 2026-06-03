import * as vscode from "vscode";
import { itemStates } from "../tree/treeConstants";
import { treeView } from "../tree/treeView";
import {
  searchInFiles,
  compareObjects,
  registerCommands,
  setButtonVisibility,
  Subscription,
} from "../util/command";
import {
  isFileScript,
  isFileWebTemp,
  getScriptsOnDisk,
  getFileUri,
  openFile,
  getLocalWorkspaces,
  readFile,
  FileExt,
} from "../util/file";
import {
  fields,
  putObject,
  getObject,
  paths,
  joinWorkspace,
  joinUrl,
  queryObject,
  Type,
  Script,
  joinChild,
  getPayload,
  Config,
} from "../util/rest";
import {
  isTypeScript,
  isTypeWebTemp,
  isWorkspaceEditable,
  isScriptNameValid,
} from "../util/validation";
import { createNewScript } from "../util/creation";
import { typeGenerator } from "../typegen/typeGenerator";
import { webView } from "../view/webView";

const pushNo = ["Push", "No"] as const,
  pushAllNo = ["Push All", "No"] as const,
  disableAllButtons = {
    push: false,
    pushAll: false,
    search: false,
    compare: false,
  } as const,
  compareOptions = {
    title: "Choose a workspace to compare against",
    placeHolder: "Workspace",
    canPickMany: false,
  } as const,
  buttonError = new Error();

class ActiveEditor {
  private static instance: ActiveEditor;
  private editor: vscode.TextEditor | undefined;
  declare private document: vscode.TextDocument;
  declare private folderUri: vscode.Uri;
  declare private name: string;
  declare private ext: FileExt;
  declare private parent: string;
  declare private type: Type;
  declare private workspace: string;
  declare private config: Config;
  declare private field: typeof fields.script | typeof fields.definition;
  declare private parentPath: string;

  private constructor() {}

  static getInstance() {
    ActiveEditor.instance ??= new ActiveEditor();
    return ActiveEditor.instance;
  }

  init(subscriptions: Subscription[]) {
    vscode.window.onDidChangeActiveTextEditor(this.parseFilePath);
    vscode.workspace.onDidRenameFiles(this.reparseFilePath);
    const commands = {
      push: this.push,
      pushAll: this.pushAll,
      newScript: this.newScript,
      search: this.search,
      compare: this.compare,
      pullObjectsFromText: this.pullObjectsFromText,
    } as const;
    registerCommands(subscriptions, commands);
  }

  private parseFilePath = async (textEditor: vscode.TextEditor | undefined) => {
    try {
      this.editor = textEditor;
      if (!this.editor) throw buttonError;
      this.document = this.editor.document;
      this.folderUri = vscode.Uri.joinPath(this.document.uri, "..");
      const parts = this.document.uri.path.split("/");
      [this.name, this.ext] = <[string, FileExt]>parts.pop()!.split(".");
      if (!this.name) throw buttonError;
      const isScript = isFileScript(this.ext);
      if (isScript && parts.length > 4) {
        this.parent = parts.pop()!;
        const type = parts.pop()!;
        if (!isTypeScript(type)) throw buttonError;
        this.type = type;
        this.field = fields.script;
        this.parentPath = joinChild(this.type, this.parent);
      } else if (isFileWebTemp(this.ext) && parts.length > 3) {
        this.parent = "";
        const type = parts.pop()!;
        if (!isTypeWebTemp(type)) throw buttonError;
        this.type = type;
        this.field = fields.definition;
        this.parentPath = this.type;
      } else throw buttonError;
      this.workspace = parts.pop()!;
      const config = webView.getConfig(parts.pop()!);
      if (Object.keys(config).length === 0) throw buttonError;
      await typeGenerator.setUrl(config.url);
      this.config = config;
      const isEditable = isWorkspaceEditable(this.workspace, this.config),
        visibility = {
          push: isEditable,
          pushAll: isEditable && isScript,
          search: isScript,
          compare: true,
        } as const;
      setButtonVisibility(visibility);
      await treeView.setActiveItem(
        this.config.name,
        this.workspace,
        this.type,
        this.name,
        this.parent,
      );
    } catch (err: any) {
      setButtonVisibility(disableAllButtons);
      treeView.activeItem = undefined;
    }
  };

  private reparseFilePath = ({ files }: vscode.FileRenameEvent) => {
    const textEditor = vscode.window?.activeTextEditor;
    if (!textEditor) return;
    for (const { newUri } of files) {
      if (textEditor.document?.uri.path !== newUri.path) continue;
      return this.parseFilePath(textEditor);
    }
  };

  private push = async () => {
    await this.document.save();
    const content = this.document.getText(),
      payload = getPayload(this.name, this.field, content);
    if (isFileScript(this.ext) && !isScriptNameValid(this.name, content))
      return vscode.window.showErrorMessage(
        "Unable to push script, name of the file and the function is not the same!",
      );
    const answer = await vscode.window.showInformationMessage(
      `Do you want to push ${this.name} to Siebel?`,
      ...pushNo,
    );
    if (answer !== "Push") return;
    const path = joinWorkspace(this.workspace, this.parentPath, this.name),
      result = await putObject(this.config, path, payload);
    if (!result) return;
    vscode.window.showInformationMessage(
      `Successfully pushed ${this.name} to Siebel!`,
    );
    treeView.activeItemState = itemStates.same;
  };

  private pushAll = async () => {
    const files = await getScriptsOnDisk(this.folderUri),
      invalid: string[] = [],
      payloads = await Promise.all(
        [...files].map(async ([fileName, fileExt]) => {
          const fileUri = getFileUri(this.folderUri, fileName, fileExt),
            content = await readFile(fileUri);
          if (!isScriptNameValid(fileName, content)) invalid.push(fileName);
          return getPayload(fileName, fields.script, content);
        }),
      );
    if (invalid.length > 0)
      return vscode.window.showErrorMessage(
        `Unable to push all, file and function names differ for the following script(s): ${invalid.join(
          ", ",
        )}`,
      );
    const answer = await vscode.window.showInformationMessage(
      `Do you want to push all scripts of ${this.parent} to Siebel?`,
      ...pushAllNo,
    );
    if (answer !== "Push All") return;
    for (const payload of payloads) {
      const path = joinWorkspace(this.workspace, this.parentPath, payload.Name),
        result = await putObject(this.config, path, payload);
      if (!result) return;
    }
    vscode.window.showInformationMessage(
      `Successfully pushed  all scripts of ${this.parent} to Siebel!`,
    );
    treeView.activeObjectState = itemStates.same;
  };

  private newScript = async () => {
    const fileUri = await createNewScript(
      this.folderUri,
      <Script>this.type,
      this.parent,
      this.config.fileExtension,
    );
    if (!fileUri) return;
    await openFile(fileUri);
    await treeView.reveal();
  };

  private search = async () => {
    const selection = this.editor!.selection,
      selected = selection.isEmpty
        ? this.document.getWordRangeAtPosition(selection.active)
        : selection,
      query = selected ? this.document.getText(selected) : "";
    await searchInFiles(this.folderUri, query);
  };

  private compare = async () => {
    const items: vscode.QuickPickItem[] = [
      {
        label: this.workspace,
        description: "Compare in the same workspace",
      },
    ];
    if (this.config.restWorkspaces) {
      const data = await getObject(
        this.config,
        paths.workspace,
        queryObject.allWorkspaces,
      );
      while (data.length > 0) {
        const {
          Name: label,
          Status: description,
          RepositoryWorkspace,
        } = data.pop()!;
        if (RepositoryWorkspace) data.push(...RepositoryWorkspace);
        if (label === this.workspace) continue;
        items.push({ label, description });
      }
    } else {
      const workspaces = await getLocalWorkspaces(this.config.name);
      for (const label of workspaces) {
        if (label === this.workspace) continue;
        items.push({ label });
      }
    }
    const answer = await vscode.window.showQuickPick(items, compareOptions);
    if (!answer) return;
    const { label } = answer,
      path = joinWorkspace(label, this.parentPath, this.name),
      response = await getObject(
        this.config,
        path,
        queryObject[`compare${this.field}`],
      ),
      content = response[0]?.[this.field],
      compareMessage = `Comparison of ${this.name} between ${label} and ${this.workspace} (on disk)`,
      state = await compareObjects(
        content,
        this.ext,
        this.document.uri,
        compareMessage,
      );
    if (label !== this.workspace) return;
    treeView.activeItemState = state;
  };

  private pullObjectsFromText = async () => {
    const text = this.document.getText(),
      config = {
        ...this.config,
        url: joinUrl(this.config.url, this.workspace),
      };
    await typeGenerator.pullObjectsFromText(text, config);
  };
}

export const activeEditor = ActiveEditor.getInstance();

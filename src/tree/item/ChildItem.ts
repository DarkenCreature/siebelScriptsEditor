import * as vscode from "vscode";

import {
  selectCommand,
  ItemState,
  itemStates,
  contextValues,
} from "../treeConstants";
import { treeView } from "../treeView";
import { compareObjects } from "../../util/command";
import {
  FileExt,
  getFileUri,
  openFile,
  readFile,
  writeFile,
} from "../../util/file";
import { fields, joinPath, Query } from "../../util/rest";
import { WebTempManager } from "../manager/WebTempManager";
import { ObjectItem } from "./ObjectItem";
import { ScriptItem } from "./ScriptItem";
import { WebTempItem } from "./WebTempItem";

const revertNo = ["Revert", "No"] as const;

export abstract class ChildItem<T extends ObjectItem | WebTempManager>
  extends vscode.TreeItem
{
  override readonly collapsibleState = vscode.TreeItemCollapsibleState.None;
  declare label: string;
  parent;
  abstract readonly field: typeof fields.script | typeof fields.definition;
  abstract readonly params: Query;
  abstract get ext(): FileExt;
  abstract refresh(): void;

  constructor(label: string, parent: T) {
    super(label);
    this.parent = parent;
    this.command = { ...selectCommand, arguments: [this] };
  }

  set state(state: ItemState) {
    this.contextValue =
      state === itemStates.same || state === itemStates.differ
        ? contextValues.child
        : undefined;
    this.iconPath = state.icon;
    this.tooltip = state.tooltip;
  }

  get path(): string {
    return joinPath(this.parent.path, this.label);
  }

  get fileUri() {
    return getFileUri(this.parent.folderUri, this.label, this.ext);
  }

  async checkDifference(text: string | undefined) {
    if (!this.parent.onDisk.has(this.label)) {
      this.state = itemStates.siebel;
      return;
    }
    const fileContent = await readFile(this.fileUri);
    this.state = fileContent === text ? itemStates.same : itemStates.differ;
  }

  async select() {
    if (this.iconPath === itemStates.siebel.icon) {
      const data = await treeView.getObject(this.path, this.params);
      if (data.length === 0) {
        this.state = itemStates.disk;
        treeView.refresh(this);
        return await openFile(this.fileUri);
      }
      const { [this.field]: text } = data[0];
      if (text === undefined) return;
      await writeFile(this.fileUri, text);
      this.parent.onDisk.set(this.label, this.ext);
      this.state = itemStates.same;
      this.refresh();
    }
    await openFile(this.fileUri);
  }

  async revert() {
    const answer = await vscode.window.showInformationMessage(
      `Do you want to overwrite ${this.label} from Siebel?`,
      ...revertNo,
    );
    if (answer !== "Revert") return;
    const response = await treeView.getObject(this.path, this.params),
      content = response[0]?.[this.field];
    if (content === undefined) return;
    treeView.syncedItem = <ScriptItem | WebTempItem>this;
    await writeFile(this.fileUri, content);
  }

  async compare() {
    const response = await treeView.getObject(this.path, this.params),
      compareMessage = `Comparison of ${this.label} in Siebel and on disk`,
      content = response[0]?.[this.field];
    if (content === undefined) return;
    this.state = await compareObjects(
      content,
      this.ext,
      this.fileUri,
      compareMessage,
    );
    this.refresh();
  }
}

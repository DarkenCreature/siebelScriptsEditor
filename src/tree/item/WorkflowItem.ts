import * as vscode from "vscode";
import { compareObjects } from "../../util/command";
import { getFileUri, openFile, readFile, writeFile } from "../../util/file";
import { joinPath, RestResponse } from "../../util/rest";
import { contextValues, itemStates, ItemState, selectCommand } from "../treeConstants";
import { treeView } from "../treeView";
import { WorkflowManager } from "../manager/WorkflowManager";

export class WorkflowItem extends vscode.TreeItem {
  override readonly collapsibleState = vscode.TreeItemCollapsibleState.None;
  declare label: string;
  readonly parent: WorkflowManager;

  constructor(label: string, parent: WorkflowManager) {
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

  get path() {
    return joinPath(this.parent.path, this.label);
  }

  get fileUri() {
    return getFileUri(this.parent.folderUri, this.label, "sblwf.json");
  }

  private serialize(workflow: RestResponse) {
    return `${JSON.stringify(workflow, null, 2)}\n`;
  }

  private async loadWorkflow() {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading workflow ${this.label}`,
        cancellable: false,
      },
      async (progress) => await treeView.getWorkflow(this.path, progress),
    );
  }

  async checkDifference(workflow: RestResponse | undefined) {
    if (!this.parent.onDisk.has(this.label)) {
      this.state = itemStates.siebel;
      return;
    }
    const local = await readFile(this.fileUri);
    this.state = workflow && local === this.serialize(workflow)
      ? itemStates.same
      : itemStates.differ;
  }

  async select() {
    if (this.iconPath === itemStates.siebel.icon) {
      const workflow = await this.loadWorkflow();
      if (!workflow) return;
      await vscode.workspace.fs.createDirectory(this.parent.folderUri);
      await writeFile(this.fileUri, this.serialize(workflow));
      this.parent.onDisk.set(this.label, "sblwf.json");
      this.state = itemStates.same;
      treeView.refresh(this);
    }
    await openFile(this.fileUri);
  }

  refresh() {
    treeView.refresh(this);
  }

  async revert() {
    const answer = await vscode.window.showInformationMessage(
      `Do you want to overwrite ${this.label} from Siebel?`,
      "Revert",
      "No",
    );
    if (answer !== "Revert") return;
    const workflow = await this.loadWorkflow();
    if (!workflow) return;
    treeView.syncedItem = this;
    await writeFile(this.fileUri, this.serialize(workflow));
  }

  async compare() {
    const workflow = await this.loadWorkflow();
    if (!workflow) return;
    this.state = await compareObjects(
      this.serialize(workflow),
      "sblwf.json",
      this.fileUri,
      `Comparison of ${this.label} in Siebel and on disk`,
    );
    treeView.refresh(this);
  }
}

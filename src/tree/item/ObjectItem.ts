import * as vscode from "vscode";
import { treeView } from "../treeView";
import { createNewScript } from "../../util/creation";
import {
  getScriptsOnDisk,
  getFileUri,
  openFile,
  writeFile,
  OnDisk,
} from "../../util/file";
import {
  joinPath,
  queryObject,
  BUSCOMP,
  Script,
  joinChild,
} from "../../util/rest";
import { ObjectManager } from "../manager/ObjectManager";
import { contextValues, ItemState, itemStates } from "../treeConstants";
import { ScriptItem } from "./ScriptItem";
import { typeGenerator } from "../../typegen/typeGenerator";

export class ObjectItem extends vscode.TreeItem {
  override readonly collapsibleState =
    vscode.TreeItemCollapsibleState.Collapsed;
  declare label: string;
  declare onDisk: OnDisk;
  parent: ObjectManager;
  treeData = new Map<string, ScriptItem>();
  isDifference = false;

  constructor(label: string, parent: ObjectManager) {
    super(label);
    this.parent = parent;
    this.contextValue =
      parent.label === BUSCOMP ? contextValues.busComp : contextValues.object;
  }

  get treeItems() {
    return [...this.treeData.values()];
  }

  get path() {
    return joinChild(<Script>this.parent.label, this.label);
  }

  get folderUri() {
    return vscode.Uri.joinPath(this.parent.folderUri, this.label);
  }

  set state(state: ItemState) {
    this.iconPath = state.icon;
    this.tooltip = state.tooltip;
  }

  private setActiveItem() {
    if (
      !treeView.activeItem ||
      treeView.activeItem.parent.path !== this.path ||
      treeView.activeItem.parent.label !== this.label
    )
      return;
    treeView.activeItem = this.treeData.get(treeView.activeItem.label);
  }

  setState() {
    if (this.onDisk.size === 0) {
      this.state = itemStates.siebel;
      return;
    }
    for (const item of this.treeItems) {
      if (
        item.iconPath !== itemStates.differ.icon &&
        item.iconPath !== itemStates.disk.icon
      )
        continue;
      this.state = itemStates.differ;
      return;
    }
    this.state = itemStates.same;
  }

  async setOnDisk() {
    this.onDisk = await getScriptsOnDisk(this.folderUri);
    this.setState();
  }

  async select() {
    this.treeData.clear();
    const data = await treeView.getObject(
        this.path,
        queryObject.pullScripts,
        false,
      ),
      inSiebel = new Set<string>(),
      siebelItems = await Promise.all(
        data.map(async ({ Name: label, Script: text }) => {
          const item = new ScriptItem(label, this);
          await item.checkDifference(text);
          inSiebel.add(label);
          return item;
        }),
      ),
      diskItems = [];
    for (const label of this.onDisk.keys()) {
      if (inSiebel.has(label)) continue;
      const item = new ScriptItem(label, this);
      item.state = itemStates.disk;
      diskItems.push(item);
    }
    for (const item of [...siebelItems, ...diskItems].sort(
      ({ label: a }, { label: b }) => a.localeCompare(b),
    )) {
      this.treeData.set(item.label, item);
    }
    this.setState();
    this.setActiveItem();
    treeView.refresh(this);
  }

  async pullAll() {
    const response = await treeView.getObject(
      this.path,
      queryObject.pullScripts,
      false,
    );
    await Promise.all(
      response.map(async ({ Name: label, Script: text }) => {
        if (this.onDisk.has(label) || !text) return;
        const fileUri = getFileUri(
          this.folderUri,
          label,
          treeView.config.fileExtension,
        );
        await writeFile(fileUri, text);
      }),
    );
    await this.refresh();
  }

  async refresh() {
    await this.setOnDisk();
    await this.select();
  }

  async newScript() {
    const fileUri = await createNewScript(
      this.folderUri,
      <Script>this.parent.label,
      this.label,
      treeView.config.fileExtension,
    );
    if (!fileUri) return;
    await this.refresh();
    await openFile(fileUri);
    await treeView.reveal();
  }

  async pullBusComp() {
    await typeGenerator.pullBusComp(this.label, treeView.config);
  }
}

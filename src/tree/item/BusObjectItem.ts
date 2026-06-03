import * as vscode from "vscode";
import { treeView } from "../treeView";
import { BUSOBJECT, joinChild, queryObject } from "../../util/rest";
import { BusObjectManager } from "../manager/BusObjectManager";
import { contextValues, ItemState, itemStates } from "../treeConstants";
import { BusCompItem } from "./BusCompItem";
import { typeGenerator } from "../../typegen/typeGenerator";
import { OnDisk } from "../../util/file";

export class BusObjectItem extends vscode.TreeItem {
  override readonly collapsibleState =
    vscode.TreeItemCollapsibleState.Collapsed;
  override readonly contextValue = contextValues.busObject;
  declare label: string;
  declare onDisk: OnDisk;
  parent: BusObjectManager;
  treeData = new Map<string, BusCompItem>();

  constructor(label: string, parent: BusObjectManager) {
    super(label);
    this.parent = parent;
  }

  set state(state: ItemState) {
    this.iconPath = state.icon;
    this.tooltip = state.tooltip;
  }

  get treeItems() {
    return [...this.treeData.values()];
  }

  get path() {
    return joinChild(BUSOBJECT, this.label);
  }

  async select() {
    this.treeData.clear();
    const data = await treeView.getObject(
      this.path,
      queryObject.pullBusObject,
      false,
    );
    await Promise.all(
      data.map(async ({ Name: label }) => {
        const item = new BusCompItem(label, this);
        item.state = this.parent.busCompsOnDisk.has(label)
          ? itemStates.same
          : itemStates.siebel;
        this.treeData.set(item.label, item);
        return item;
      }),
    );
    treeView.refresh(this);
  }

  async pullBusObject() {
    await typeGenerator.pullBusObject(this.label, treeView.config);
    this.state = itemStates.same;
    treeView.refresh(this);
  }
}

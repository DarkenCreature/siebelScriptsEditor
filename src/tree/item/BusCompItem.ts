import * as vscode from "vscode";
import { treeView } from "../treeView";
import { joinPath } from "../../util/rest";
import {
  contextValues,
  selectCommand,
  ItemState,
  itemStates,
} from "../treeConstants";
import { BusObjectItem } from "./BusObjectItem";
import { typeGenerator } from "../../typegen/typeGenerator";

export class BusCompItem extends vscode.TreeItem {
  override readonly collapsibleState = vscode.TreeItemCollapsibleState.None;
  override readonly contextValue = contextValues.busObjectBusComp;
  declare label: string;
  parent;

  constructor(label: string, parent: BusObjectItem) {
    super(label);
    this.parent = parent;
    this.command = { ...selectCommand, arguments: [this] };
  }

  set state(state: ItemState) {
    this.iconPath = state.icon;
    this.tooltip = state.tooltip;
  }

  get path(): string {
    return joinPath(this.parent.path, this.label);
  }

  async select() {
    await typeGenerator.pullBusComp(this.label, treeView.config);
    this.state = itemStates.same;
    treeView.refresh(this);
  }
}

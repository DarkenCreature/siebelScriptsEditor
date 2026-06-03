import * as vscode from "vscode";
import { BusObjectItem } from "../item/BusObjectItem";
import { ObjectItem } from "../item/ObjectItem";
import { WebTempItem } from "../item/WebTempItem";
import { treeView } from "../treeView";
import { searchInFiles } from "../../util/command";
import {
  BusObject,
  fields,
  RestResponse,
  getSearchQuery,
  Type,
} from "../../util/rest";
import { ItemState } from "../treeConstants";

export abstract class ManagerBase<
  T extends ObjectItem | WebTempItem | BusObjectItem,
>
  extends vscode.TreeItem
{
  override readonly collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  readonly parent = undefined;
  readonly treeData = new Map<string, T>();
  declare label: Type | BusObject;
  declare folderUri: vscode.Uri;
  abstract readonly path: Type | BusObject;
  protected abstract readonly searchFields:
    | typeof fields.name
    | typeof fields.nameDefinition;
  protected abstract setTreeItems(data?: RestResponse[]): Promise<void>;

  get treeItems() {
    return [...this.treeData.values()];
  }

  set state(state: ItemState) {
    this.iconPath = state.icon;
    this.tooltip = state.tooltip;
  }

  async searchDisk() {
    await searchInFiles(this.folderUri);
  }

  async search(searchString?: string) {
    clearTimeout(treeView.timeoutId);
    if (!searchString) return await this.setTreeItems();
    treeView.timeoutId = setTimeout(async () => {
      const query = getSearchQuery(this.searchFields, searchString),
        data = await treeView.getObject(this.label, query);
      await this.setTreeItems(data);
    }, 300);
  }
}

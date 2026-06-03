import * as vscode from "vscode";
import { treeView } from "../treeView";
import { getScriptsOnDisk, OnDisk } from "../../util/file";
import { BUSOBJECT, fields, RestResponse } from "../../util/rest";
import { BusObjectItem } from "../item/BusObjectItem";
import { contextValues, itemStates } from "../treeConstants";
import { ManagerBase } from "./ManagerBase";
import { typeGenerator } from "../../typegen/typeGenerator";
import { searchInFiles } from "../../util/command";

export class BusObjectManager extends ManagerBase<BusObjectItem> {
  override readonly label = BUSOBJECT;
  override readonly contextValue = contextValues.manager;
  protected readonly searchFields = fields.name;
  readonly path = BUSOBJECT;
  declare busObjectsOnDisk: OnDisk;
  declare busCompsOnDisk: OnDisk;

  constructor() {
    super(BUSOBJECT);
  }

  protected async setTreeItems(data?: RestResponse[]) {
    this.busObjectsOnDisk = await getScriptsOnDisk(typeGenerator.busObjectsUri);
    this.busCompsOnDisk = await getScriptsOnDisk(typeGenerator.busCompsUri);
    this.treeData.clear();

    if (data) {
      this.state = itemStates.online;

      for (const { Name } of data) {
        const item = new BusObjectItem(Name, this);
        item.state = this.busObjectsOnDisk.has(Name)
          ? itemStates.same
          : itemStates.siebel;
        this.treeData.set(Name, item);
      }
    } else {
      this.state = itemStates.offline;

      for (const [busObject] of this.busObjectsOnDisk) {
        const item = new BusObjectItem(busObject, this);
        item.state = itemStates.same;
        this.treeData.set(busObject, item);
      }
    }
    treeView.refresh(this);
  }

  override async searchDisk() {
    await searchInFiles(typeGenerator.typesUri);
  }
}

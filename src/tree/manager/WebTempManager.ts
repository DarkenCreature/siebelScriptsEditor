import { treeView } from "../treeView";
import { getWebTempsOnDisk, OnDisk } from "../../util/file";
import {
  queryObject,
  joinPath,
  WEBTEMP,
  fields,
  RestResponse,
} from "../../util/rest";
import { WebTempItem } from "../item/WebTempItem";
import { contextValues, itemStates } from "../treeConstants";
import { ManagerBase } from "./ManagerBase";

export class WebTempManager extends ManagerBase<WebTempItem> {
  override readonly label = WEBTEMP;
  override readonly contextValue = contextValues.manager;
  protected readonly searchFields = fields.nameDefinition;
  readonly path = WEBTEMP;
  declare onDisk: OnDisk;

  constructor() {
    super(WEBTEMP);
  }

  private setActiveItem() {
    if (
      !treeView.activeItem ||
      treeView.activeItem.parent.path !== this.path ||
      treeView.activeItem.label !== this.label
    )
      return;
    treeView.activeItem = this.treeData.get(treeView.activeItem.label);
  }

  protected async setTreeItems(data?: RestResponse[]) {
    this.onDisk = await getWebTempsOnDisk(this.folderUri);
    const source =
      data ??
      (await Promise.all(
        [...this.onDisk.keys()].map(async (Name) => {
          const path = joinPath(this.label, Name),
            data = await treeView.getObject(path, queryObject.pullDefinition),
            Definition = data[0]?.Definition;
          return { Name, Definition };
        }),
      ));
    this.state = data ? itemStates.online : itemStates.offline;
    this.treeData.clear();
    await Promise.all(
      source.map(async ({ Name: label, Definition: text }) => {
        const item = new WebTempItem(label, this);
        await item.checkDifference(text);
        this.treeData.set(label, item);
      }),
    );
    this.setActiveItem();
    treeView.refresh(this);
  }

  async getItem(name: string) {
    return this.treeData.get(name);
  }
}

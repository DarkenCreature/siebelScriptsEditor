import { treeView } from "../treeView";
import { createNewService } from "../../util/creation";
import { getScriptParentsOnDisk, openFile } from "../../util/file";
import { fields, SERVICE, Script, RestResponse } from "../../util/rest";
import { ObjectItem } from "../item/ObjectItem";
import { contextValues, itemStates } from "../treeConstants";
import { ManagerBase } from "./ManagerBase";

export class ObjectManager extends ManagerBase<ObjectItem> {
  protected readonly searchFields = fields.name;
  readonly path;

  constructor(type: Script) {
    super(type);
    this.contextValue =
      type === SERVICE ? contextValues.serviceManager : contextValues.manager;
    this.path = type;
  }

  protected async setTreeItems(data?: RestResponse[]) {
    const source = data ?? await getScriptParentsOnDisk(this.folderUri);
    this.state = data ? itemStates.online : itemStates.offline;
    this.treeData.clear();
    await Promise.all(
      source.map(async ({ Name: label }) => {
        const item = new ObjectItem(label, this);
        await item.setOnDisk();
        this.treeData.set(label, item);
      }),
    );
    treeView.refresh(this);
  }

  async getItem(name: string, parent?: string) {
    const objectItem = this.treeData.get(parent!);
    if (!objectItem) return;
    const item = objectItem.treeData.get(name);
    if (item) return item;
    await objectItem.refresh();
    return objectItem.treeData.get(name);
  }

  async newService() {
    const newServiceData = await createNewService(
      treeView.config,
      this.folderUri,
    );
    if (!newServiceData) return;
    const [serviceName, fileUri] = newServiceData;
    await this.setTreeItems();
    await this.treeData.get(serviceName)!.refresh();
    await openFile(fileUri);
    await treeView.reveal();
  }
}

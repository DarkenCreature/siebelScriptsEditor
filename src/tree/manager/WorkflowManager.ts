import { treeView } from "../treeView";
import { getWorkflowsOnDisk, OnDisk } from "../../util/file";
import {
  fields,
  getSearchQuery,
  joinPath,
  queryObject,
  RestResponse,
  WORKFLOW,
} from "../../util/rest";
import { contextValues, itemStates } from "../treeConstants";
import { ManagerBase } from "./ManagerBase";
import { WorkflowItem } from "../item/WorkflowItem";

export class WorkflowManager extends ManagerBase<WorkflowItem> {
  override readonly label = WORKFLOW;
  override readonly contextValue = contextValues.manager;
  protected readonly searchFields = fields.name;
  readonly path = WORKFLOW;
  declare onDisk: OnDisk;

  constructor() {
    super(WORKFLOW);
  }

  protected async setTreeItems(data?: RestResponse[]) {
    this.onDisk = await getWorkflowsOnDisk(this.folderUri);
    const source = data ?? [...this.onDisk.keys()].map((Name) => ({ Name }));
    this.state = data ? itemStates.online : itemStates.offline;
    this.treeData.clear();
    await Promise.all(
      source.map(async ({ Name }) => {
        const item = new WorkflowItem(Name, this);
        if (data && this.onDisk.has(Name)) {
          const workflow = await treeView.getWorkflow(joinPath(this.path, Name));
          await item.checkDifference(workflow);
        } else if (data) {
          item.state = itemStates.siebel;
        } else {
          item.state = itemStates.disk;
        }
        this.treeData.set(Name, item);
      }),
    );
    treeView.refresh(this);
  }

  async getItem(name: string) {
    return this.treeData.get(name);
  }
}

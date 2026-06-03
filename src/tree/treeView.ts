import * as vscode from "vscode";
import { BusObjectItem } from "./item/BusObjectItem";
import { ObjectItem } from "./item/ObjectItem";
import { ScriptItem } from "./item/ScriptItem";
import { WebTempItem } from "./item/WebTempItem";
import { BusObjectManager } from "./manager/BusObjectManager";
import { ObjectManager } from "./manager/ObjectManager";
import { WebTempManager } from "./manager/WebTempManager";
import { itemStates, ItemState } from "./treeConstants";
import { getWorkspaceUri } from "../util/file";
import {
  getObject,
  putObject,
  BUSOBJECT,
  APPLET,
  APPLICATION,
  BUSCOMP,
  SERVICE,
  WEBTEMP,
  joinUrl,
  Query,
  BusObject,
  Script,
  Type,
  WebTemp,
  RestResponse,
  Payload,
  RestConfig,
  Config,
} from "../util/rest";
import { isWorkspaceEditable } from "../util/validation";
import {
  registerCommands,
  setButtonVisibility,
  Subscription,
} from "../util/command";
import { BusCompItem } from "./item/BusCompItem";
import { typeGenerator } from "../typegen/typeGenerator";

const revealOptions = {
  select: true,
  focus: true,
} as const;

class TreeView {
  private static instance: TreeView;
  private readonly treeObject;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter();
  private readonly treeData = new Map<
    Type | BusObject,
    ObjectManager | WebTempManager | BusObjectManager
  >([
    [SERVICE, new ObjectManager(SERVICE)],
    [BUSCOMP, new ObjectManager(BUSCOMP)],
    [APPLET, new ObjectManager(APPLET)],
    [APPLICATION, new ObjectManager(APPLICATION)],
    [WEBTEMP, new WebTempManager()],
    [BUSOBJECT, new BusObjectManager()],
  ]);
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  readonly refresh = (treeItem: vscode.TreeItem) =>
    this._onDidChangeTreeData.fire(treeItem);
  readonly config: RestConfig = {
    url: "",
    username: "",
    password: "",
    fileExtension: "js",
    maxPageSize: 100,
  };
  private baseURL = "";
  declare folderUri: vscode.Uri;
  activeItem: ScriptItem | WebTempItem | undefined;
  syncedItem: ScriptItem | WebTempItem | undefined;
  connection = "";
  workspace = "";
  type: Type = SERVICE;
  timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  private changeTimeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  private constructor() {
    this.treeObject = vscode.window.createTreeView("objectsView", {
      treeDataProvider: this,
      showCollapseAll: true,
    });
  }

  static getInstance() {
    TreeView.instance ??= new TreeView();
    return TreeView.instance;
  }

  init(subscriptions: Subscription[]) {
    const commands = {
      selectTreeItem: async (
        treeItem: ScriptItem | WebTempItem | BusCompItem,
      ) => await treeItem.select(),
      searchDisk: async (
        treeItem: ObjectManager | WebTempManager | BusObjectManager,
      ) => await treeItem.searchDisk(),
      showFilesOnDisk: async (
        treeItem: ObjectManager | WebTempManager | BusObjectManager,
      ) => await treeItem.search(),
      newServiceTree: async (treeItem: ObjectManager) =>
        await treeItem.newService(),
      pullBusCompTree: async (treeItem: ObjectItem) =>
        await treeItem.pullBusComp(),
      pullAllTree: async (treeItem: ObjectItem) => await treeItem.pullAll(),
      newScriptTree: async (treeItem: ObjectItem) => await treeItem.newScript(),
      revertTree: async (treeItem: ScriptItem | WebTempItem) =>
        await treeItem.revert(),
      compareTree: async (treeItem: ScriptItem | WebTempItem) =>
        await treeItem.compare(),
      pullBusObjectTree: async (treeItem: BusObjectItem) =>
        await treeItem.pullBusObject(),
    };
    this.treeObject.onDidExpandElement(async ({ element }) => {
      if (element instanceof ObjectItem || element instanceof BusObjectItem)
        await element.select();
    });
    vscode.workspace.onDidChangeTextDocument(this.changeListener);
    registerCommands(subscriptions, commands);
  }

  private changeListener = () => {
    if (this.syncedItem) {
      this.syncedItem.state = itemStates.same;
      this.syncedItem.refresh();
      this.syncedItem = undefined;
      return;
    }
    clearTimeout(this.changeTimeoutId);
    this.changeTimeoutId = setTimeout(() => {
      if (!this.activeItem || this.activeItem.iconPath !== itemStates.same.icon)
        return;
      this.activeItemState = itemStates.differ;
      this.activeItem.refresh();
    }, 500);
  };

  set activeItemState(state: ItemState) {
    if (!this.activeItem || this.activeItem.state === state) return;
    this.activeItem.state = state;
    this.activeItem.refresh();
  }

  set activeObjectState(state: ItemState) {
    if (!this.activeItem) return;
    const objectItem = this.activeItem.parent;
    for (const item of objectItem.treeData.values()) {
      item.state = state;
    }
    (<ObjectItem>this.activeItem.parent).state = itemStates.same;
    this.refresh(objectItem);
  }

  getTreeItem(
    treeItem:
      | ObjectManager
      | WebTempManager
      | ObjectItem
      | ScriptItem
      | WebTempItem,
  ) {
    return treeItem;
  }

  getChildren(treeItem?: ObjectManager | WebTempManager | ObjectItem) {
    return treeItem ? treeItem.treeItems : [...this.treeData.values()];
  }

  getParent(
    treeItem:
      | ObjectManager
      | WebTempManager
      | BusObjectManager
      | ObjectItem
      | ScriptItem
      | WebTempItem
      | BusCompItem,
  ) {
    return treeItem.parent;
  }

  async setConfig({
    url,
    username,
    password,
    fileExtension = "js",
    maxPageSize = 100,
  }: Config) {
    this.baseURL = url;
    this.config.username = username;
    this.config.password = password;
    this.config.fileExtension = fileExtension;
    this.config.maxPageSize = maxPageSize;
    await typeGenerator.setUrl(url);
    await this.setWorkspace();
  }

  async setWorkspace() {
    this.config.url = joinUrl(this.baseURL, this.workspace);
    this.folderUri = getWorkspaceUri(this.connection, this.workspace);
    await Promise.all(
      [...this.treeData].map(async ([type, treeItem]) => {
        if (type !== BUSOBJECT)
          treeItem.folderUri = vscode.Uri.joinPath(this.folderUri, type);
        await treeItem.search();
      }),
    );
    setButtonVisibility({
      treeEdit: isWorkspaceEditable(this.workspace, this.config),
    });
    this.activeItem = undefined;
  }

  async getObject(path: string, params: Query, firstPageOnly = true): Promise<RestResponse[]> {
    return await getObject(this.config, path, params, firstPageOnly);
  }

  async putObject(path: string, data: Payload) {
    return await putObject(this.config, path, data);
  }

  async search(searchString?: string) {
    await this.treeData.get(this.type)!.search(searchString);
  }

  async setActiveItem(
    connection: string,
    workspace: string,
    type: Script | WebTemp,
    name: string,
    parent?: string,
  ) {
    this.activeItem =
      this.connection === connection && this.workspace === workspace
        ? await (<ObjectManager | WebTempManager>(
            this.treeData.get(type)
          )).getItem(name, parent)
        : undefined;
  }

  async reveal() {
    await this.treeObject.reveal(this.activeItem, revealOptions);
  }
}

export const treeView = TreeView.getInstance();

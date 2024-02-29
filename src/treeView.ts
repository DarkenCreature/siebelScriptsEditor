import { basename, dirname, extname, join } from "path";
import * as vscode from "vscode";
import {
  repositoryObjects,
  WORKSPACE,
  DEFAULT_SCRIPT_FETCHING,
  LOCAL_FILE_EXTENSION,
  SINGLE_FILE_AUTODOWNLOAD,
  NAME,
  NAMESCRIPT,
  SCRIPT,
  DEFINITION,
  WEBTEMP,
  FILE_NAME_INFO,
  OPEN_FILE,
  BUSCOMP,
  SERVICE,
  APPLET,
  APPLICATION,
  siebelObjects,
  INFO_KEY_FOLDER_CREATED,
  INFO_KEY_LAST_PUSH,
  INFO_KEY_LAST_UPDATE,
  GET,
  baseQueryParams,
  CONNECTIONS,
  DEFAULT_CONNECTION_NAME,
  ERR_NO_CONN_SETTING,
} from "./constants";
import { getDataFromSiebel, getWorkspaces } from "./dataService";
import { existsSync, readdirSync } from "fs";
import { getConnection, getSetting, joinUrl, timestamp, writeFile } from "./utility";
import axios from "axios";

type TreeItem = TreeItemObject | TreeItemScript | TreeItemWebTemp;

//Icon paths for the checkmark in the tree views
const checkmarkIconPath = {
  light: join(__filename, "..", "..", "media", "checkmark.png"),
  dark: join(__filename, "..", "..", "media", "checkmark.png"),
} as const;

//container class for the tree views
export class TreeViews {
  private readonly workspaceFolder =
    vscode.workspace.workspaceFolders?.[0].uri.fsPath!;
  private readonly service = new TreeDataProviderObject(SERVICE);
  private readonly buscomp = new TreeDataProviderObject(BUSCOMP);
  private readonly applet = new TreeDataProviderObject(APPLET);
  private readonly application = new TreeDataProviderObject(APPLICATION);
  private readonly webtemp = new TreeDataProviderWebTemp();
  private readonly treeDataProviders: (
    | TreeDataProviderObject
    | TreeDataProviderWebTemp
  )[] = [];
  private interceptor = 0;
  private _workspace = "";
  workspaces: string[] = [];
  connection = "";
  type: SiebelObject = SERVICE;

  constructor() {
    for (const type of siebelObjects) {
      this.createTreeView(type);
      this.treeDataProviders.push(this[type]);
    }
  }

  createTreeView = (type: SiebelObject) =>
    vscode.window
      .createTreeView(type, {
        treeDataProvider: this[type],
        showCollapseAll: type !== WEBTEMP,
      })
      .onDidChangeSelection(async (e) => this[type].selectionChange(e as any));

  get connections() {
    return getSetting(CONNECTIONS).map(({ name }) => name);
  }

  set workspace(newWorkspace: string) {
    this._workspace = newWorkspace;
    this.createInterceptor();
    for (let treeDataProvider of this.treeDataProviders) {
      treeDataProvider.folder = this.folder;
      treeDataProvider.clear();
    }
  }

  get workspace() {
    return this._workspace;
  }

  get folder() {
    return join(this.workspaceFolder, this.connection || "", this.workspace || "");
  }

  setState = async () => {
    if (this.connections.length === 0)
      return vscode.window.showErrorMessage(ERR_NO_CONN_SETTING);
    const defaultConnectionName = getSetting(DEFAULT_CONNECTION_NAME),
      name =
        this.connections.includes(this.connection) ? this.connection :
        this.connections.includes(defaultConnectionName)
          ? defaultConnectionName
          : getSetting(CONNECTIONS)[0].name,
      {
        url,
        username,
        password,
        workspaces,
        defaultWorkspace,
        restWorkspaces,
      } = getConnection(name);
    this.connection = name;
    this.workspaces = restWorkspaces
      ? await getWorkspaces({ url, username, password })
      : workspaces;
    this.workspace =
      restWorkspaces || !workspaces.includes(defaultWorkspace)
        ? this.workspaces[0]
        : defaultWorkspace;
  };

  getState = () => ({
    connections: this.connections,
    selectedConnection: this.connection || "",
    workspaces: this.workspaces,
    selectedWorkspace: this.workspace || "",
  });

  createInterceptor = () => {
    if (!this.connection) return;
    const { url, username, password } = getConnection(this.connection);
    axios.interceptors.request.eject(this.interceptor);
    this.interceptor = axios.interceptors.request.use((config) => {
      config.headers["Content-Type"] = "application/json";
      return {
        ...config,
        baseURL: joinUrl(url, WORKSPACE, this.workspace),
        method: GET,
        withCredentials: true,
        auth: { username, password },
        params: {
          ...config.params,
          ...baseQueryParams,
        },
      };
    });
  };

  search = async (searchString: string) =>
    await this[this.type].debouncedSearch(searchString);

  clear = () => {
    for (const treeDataProvider of this.treeDataProviders) {
      treeDataProvider.clear();
    }
  };
}

//classes for the tree data providers
class TreeDataProviderBase {
  readonly type: SiebelObject;
  readonly objectUrl: string;
  private timeoutId: NodeJS.Timeout | number | null = null;
  private _folder = "";
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  data: (TreeItemObject | TreeItemWebTemp)[] = [];
  dataObject: ScriptObject | WebTempObject = {};

  constructor(type: SiebelObject) {
    this.type = type;
    this.objectUrl = repositoryObjects[type].parent;
    this.folder = "";
  }

  set folder(siebelWorkspaceFolder: string) {
    this._folder = join(siebelWorkspaceFolder, this.type);
  }

  get folder() {
    return this._folder;
  }

  getTreeItem = (element: TreeItem) => element;

  createTreeItems = (): (TreeItemObject | TreeItemWebTemp)[] => [];

  createTreeViewData = async (searchSpec: string) => {};

  debounce = async (callback: () => void) => {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      callback();
      this.timeoutId = null;
    }, 300);
  };

  debouncedSearch = async (searchSpec: string) =>
    await this.debounce(() => this.createTreeViewData(searchSpec));

  refresh = () => {
    this.data = this.createTreeItems();
    this._onDidChangeTreeData.fire(null);
  };

  clear = () => {
    this.dataObject = {};
    this.data = [];
    this._onDidChangeTreeData.fire(null);
  };

  writeInfo = async (folderPath: string, fileNames: string[]) => {
    try {
      vscode.workspace.saveAll(false);
      let infoJSON: InfoObject;
      const filePath = join(folderPath, FILE_NAME_INFO),
        fileUri = vscode.Uri.file(filePath),
        isWebTemp = this.type === WEBTEMP,
        dateInfo = {
          [INFO_KEY_LAST_UPDATE]: timestamp(),
          [INFO_KEY_LAST_PUSH]: "",
        };
      if (existsSync(filePath)) {
        //update info.json if exists
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        infoJSON = JSON.parse(Buffer.from(fileContent).toString());
        for (const fileName of fileNames) {
          if (infoJSON.files.hasOwnProperty(fileName))
            infoJSON.files[fileName][INFO_KEY_LAST_UPDATE] = timestamp();
          else infoJSON.files[fileName] = dateInfo;
        }
      } else {
        //create info.json if not exists
        infoJSON = {
          [INFO_KEY_FOLDER_CREATED]: timestamp.toString(),
          connection: basename(dirname(this.folder)),
          workspace: basename(dirname(dirname(this.folder))),
          type: this.type,
          files: {},
        };
        if (!isWebTemp) infoJSON.siebelObjectName = basename(folderPath);
        for (const fileName of fileNames) {
          infoJSON.files[fileName] = dateInfo;
        }
      }
      writeFile(filePath, JSON.stringify(infoJSON, null, 2));
    } catch (err: any) {
      vscode.window.showErrorMessage(err.message);
    }
  };
}

export class TreeDataProviderObject extends TreeDataProviderBase {
  readonly type;
  readonly scriptUrl: string;
  data: TreeItemObject[] = [];
  dataObject: ScriptObject = {};

  constructor(type: NotWebTemp) {
    super(type);
    this.type = type;
    this.scriptUrl = repositoryObjects[type].child;
  }

  getChildren = (element: TreeItem) =>
    element instanceof TreeItemObject
      ? Object.entries(element.scripts).map(
          ([scriptName, onDisk]) =>
            new TreeItemScript(scriptName, element.label, onDisk)
        )
      : this.data;

  createTreeItems = () =>
    Object.entries(this.dataObject).map(
      ([name, scripts]) => new TreeItemObject(name, scripts)
    );

  createTreeViewData = async (searchSpec: string) => {
    const data: ScriptResponse[] = await getDataFromSiebel(
      this.objectUrl,
      NAME,
      searchSpec
    );
    this.dataObject = {};
    for (const { Name } of data) {
      const exists = existsSync(join(this.folder, Name));
      this.dataObject[Name] = {};
      if (!exists) continue;
      const fileNames = readdirSync(join(this.folder, Name));
      for (let file of fileNames) {
        if (file !== FILE_NAME_INFO)
          this.dataObject[Name][basename(file, extname(file))] = true;
      }
    }
    this.refresh();
  };

  getAllServerScripts = async (parentName: string, namesOnly = false) => {
    const folderPath = join(this.folder, parentName),
      objectUrlPath = joinUrl(this.objectUrl, parentName, this.scriptUrl),
      data = await getDataFromSiebel(
        objectUrlPath,
        namesOnly ? NAME : NAMESCRIPT
      ),
      scriptNames = [],
      localFileExtension = getSetting(LOCAL_FILE_EXTENSION);
    for (const { Name, Script } of data) {
      const fileNameNoExt = join(folderPath, Name);
      scriptNames.push(Name);
      this.dataObject[parentName][Name] = namesOnly
        ? existsSync(`${fileNameNoExt}.js`) || existsSync(`${fileNameNoExt}.ts`)
        : true;
      if (namesOnly || !Script) continue;
      const filePath = join(folderPath, `${Name}${localFileExtension}`);
      await writeFile(filePath, Script, OPEN_FILE);
    }
    if (!namesOnly) await this.writeInfo(folderPath, scriptNames);
    this.refresh();
  };

  getServerScript = async (objectName: string, parentName: string) => {
    const folderPath = join(this.folder, parentName),
      objectUrlPath = joinUrl(
        this.objectUrl,
        parentName,
        this.scriptUrl,
        objectName
      ),
      data = await getDataFromSiebel(objectUrlPath, SCRIPT),
      script = data[0]?.Script,
      localFileExtension = getSetting(LOCAL_FILE_EXTENSION),
      OPEN_FILE = true;
    if (!script) return;
    this.dataObject[parentName][objectName] = true;
    const filePath = join(folderPath, `${objectName}${localFileExtension}`);
    await writeFile(filePath, script, OPEN_FILE);
    await this.writeInfo(folderPath, [objectName]);
    this.refresh();
  };

  selectionChange = async ({
    selection: [selectedItem],
  }: vscode.TreeViewSelectionChangeEvent<TreeItemObject | TreeItemScript>) => {
    if (!selectedItem) return;
    const { label } = selectedItem,
      singleFileAutoDownload = getSetting(SINGLE_FILE_AUTODOWNLOAD);
    if (selectedItem instanceof TreeItemObject) {
      const defaultScriptFetching = getSetting(DEFAULT_SCRIPT_FETCHING),
        answer =
          defaultScriptFetching !== "None - always ask"
            ? defaultScriptFetching
            : await vscode.window.showInformationMessage(
                `Do you want to get the ${label} ${this.objectUrl} from Siebel?`,
                "Yes",
                "Only method names",
                "No"
              ),
        methodsOnly = answer === "Only method names";
      if (!(answer === "Yes" || answer === "All scripts" || methodsOnly))
        return;
      return await this.getAllServerScripts(label, methodsOnly);
    }
    if (selectedItem instanceof TreeItemScript) {
      const { parent } = selectedItem,
        answer = singleFileAutoDownload
          ? "Yes"
          : await vscode.window.showInformationMessage(
              `Do you want to get the ${label} ${this.objectUrl} method from Siebel?`,
              "Yes",
              "No"
            );
      if (answer !== "Yes") return;
      return await this.getServerScript(label, parent);
    }
  };
}

export class TreeDataProviderWebTemp extends TreeDataProviderBase {
  data: TreeItemWebTemp[] = [];
  dataObject: WebTempObject = {};

  constructor() {
    super(WEBTEMP);
  }

  getChildren = (element: TreeItem) => this.data;

  createTreeItems = () =>
    Object.entries(this.dataObject).map(
      ([name, onDisk]) => new TreeItemWebTemp(name, onDisk)
    );

  createTreeViewData = async (searchSpec: string) => {
    const data: WebTempResponse[] = await getDataFromSiebel(
      this.objectUrl,
      NAME,
      searchSpec
    );
    this.dataObject = {};
    for (let row of data) {
      this.dataObject[row.Name] = existsSync(
        join(this.folder, `${row.Name}.html`)
      );
    }
    this.refresh();
  };

  getWebTemplate = async (objectName: string) => {
    const objectUrlPath = joinUrl(this.objectUrl, objectName),
      data = await getDataFromSiebel(objectUrlPath, DEFINITION),
      webtemp = data[0]?.Definition,
      OPEN_FILE = true;
    if (webtemp === undefined) return;
    this.dataObject[objectName] = true;
    const filePath = join(this.folder, `${objectName}.html`);
    await writeFile(filePath, webtemp, OPEN_FILE);
    await this.writeInfo(this.folder, [objectName]);
    this.refresh();
  };

  selectionChange = async ({
    selection: [selectedItem],
  }: vscode.TreeViewSelectionChangeEvent<TreeItemWebTemp>) => {
    if (!selectedItem) return;
    const { label } = selectedItem,
      singleFileAutoDownload = getSetting(SINGLE_FILE_AUTODOWNLOAD);
    const answer = singleFileAutoDownload
      ? "Yes"
      : await vscode.window.showInformationMessage(
          `Do you want to get the ${label} ${this.objectUrl} definition from Siebel?`,
          "Yes",
          "No"
        );
    if (answer !== "Yes") return;
    return await this.getWebTemplate(label);
  };
}

class TreeItemObject extends vscode.TreeItem {
  label: string;
  scripts: Scripts;
  constructor(label: string, scripts: Scripts) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.label = label;
    this.scripts = scripts;
    if (Object.values(scripts).some((onDisk) => onDisk))
      this.iconPath = checkmarkIconPath;
  }
}

class TreeItemScript extends vscode.TreeItem {
  label: string;
  parent: string;
  constructor(label: string, parent: string, onDisk: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.label = label;
    this.parent = parent;
    if (onDisk) this.iconPath = checkmarkIconPath;
  }
}

class TreeItemWebTemp extends vscode.TreeItem {
  label: string;
  constructor(label: string, onDisk: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.label = label;
    if (onDisk) this.iconPath = checkmarkIconPath;
  }
}

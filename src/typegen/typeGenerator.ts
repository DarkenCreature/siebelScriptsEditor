import * as vscode from "vscode";
import {
  typesFolderUri,
  connectionShimFileUri,
  writeFile,
  exists,
} from "../util/file";
import {
  joinPath,
  paths,
  getObject,
  BUSCOMP,
  BUSOBJECT,
  queryObject,
  RestConfig,
  joinChild,
} from "../util/rest";

const yesNo = ["Yes", "No"] as const;
const busObjectOptions = {
    title: "Select which Business Objects you want to download Business Components for",
    canPickMany: true,
  } as const,
  busCompOptions = {
    title: "Select which Business Components you want to download Fields for",
    canPickMany: true,
  } as const,
  reBusObject = /GetBusObject\s*\(\s*["']([^"']+)["']\s*\)/g,
  reBusComp = /GetBusComp\s*\(\s*["']([^"']+)["']\s*\)/g;

class TypeGenerator {
  private static instance: TypeGenerator;
  declare private url: string;
  declare private folder: string;
  declare private typesFileUri: vscode.Uri;
  declare typesUri: vscode.Uri;
  declare busObjectsUri: vscode.Uri;
  declare busCompsUri: vscode.Uri;

  private constructor() {}

  static getInstance() {
    TypeGenerator.instance ??= new TypeGenerator();
    return TypeGenerator.instance;
  }

  private get urlFolder() {
    return this.url
      .replace(/^https?:\/\//i, "")
      .replace(/\/siebel\/v[\d.]+$/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  private get shimFile() {
    return `import { BusObjectBusComps, BusCompFields } from "./types/${this.folder}/types";\nexport type BusObjMap = BusObjectBusComps;\nexport type BusCompMap = BusCompFields;`;
  }

  private getObjecTypes(type: "BusComps" | "Fields", items: string[]) {
    return `const list = ${JSON.stringify(items)} as const;\nexport type ${type} = (typeof list)[number];`;
  }

  private getBusObjectRow(name: string) {
    return `\t"${name}": import("./busobjects/${name}").BusComps;`;
  }

  private getBusCompRow(name: string) {
    return `\t"${name}": BusCompFieldType<import("./buscomps/${name}").Fields>;`;
  }

  private getTypes(busObjects: string[], busComps: string[]) {
    return `export type BusObjectBusComps = {\n${busObjects.join(
      "\n",
    )}\n};\nexport type BusCompFields = {\n${busComps.join("\n")}\n};`;
  }

  private async getRows(
    folderUri: vscode.Uri,
    getRow: typeof this.getBusObjectRow | typeof this.getBusCompRow,
  ) {
    const isFolder = await exists(folderUri),
      rows: string[] = [];
    if (!isFolder) return rows;
    const objects = await vscode.workspace.fs.readDirectory(folderUri);
    for (const [nameExt, fileType] of objects) {
      const [name, ext] = nameExt.split(".");
      if (fileType !== 1 || ext !== "ts") continue;
      rows.push(getRow(name));
    }
    return rows;
  }

  private async createBusObjectFile(name: string, config: RestConfig) {
    const path = joinChild(BUSOBJECT, name),
      response = await getObject(
        config,
        path,
        queryObject.pullBusObject,
        false,
      );
    if (response.length === 0) return;
    const fileUri = vscode.Uri.joinPath(this.busObjectsUri, `${name}.ts`),
      busComps = [];

    for (const { Name } of response) {
      busComps.push(Name);
    }
    const content = this.getObjecTypes("BusComps", busComps);
    await writeFile(fileUri, content);
  }

  private async createBusCompFile(name: string, config: RestConfig) {
    const path = joinPath(BUSCOMP, name, paths.field),
      response = await getObject(config, path, queryObject.pullBusComp, false);
    if (response.length === 0) return;
    const fileUri = vscode.Uri.joinPath(this.busCompsUri, `${name}.ts`),
      fields = [];

    for (const { Name, PickList } of response) {
      fields.push(Name);
      if (!PickList) continue;
      const pickListPath = joinPath(paths.pickList, PickList),
        typeValueNotNull = await getObject(
          config,
          pickListPath,
          queryObject.pullPickList,
        );
      if (typeValueNotNull.length === 0) continue;
      fields.push(`${Name}.TransCode`);
    }
    const content = this.getObjecTypes("Fields", fields);
    await writeFile(fileUri, content);
  }

  private async createTypesFile() {
    try {
      const busObjects = await this.getRows(
          this.busObjectsUri,
          this.getBusObjectRow,
        ),
        busComps = await this.getRows(this.busCompsUri, this.getBusCompRow),
        content = this.getTypes(busObjects, busComps);
      await writeFile(this.typesFileUri, content);
    } catch (e: any) {
      vscode.window.showErrorMessage(e.toString());
    }
  }

  private async getSelectedItems(
    text: string,
    regexp: RegExp,
    folderUri: vscode.Uri,
    options: vscode.QuickPickOptions & { canPickMany: true },
  ) {
    const objects = new Set<string>(),
      items: vscode.QuickPickItem[] = [];

    for (const [, label] of text.matchAll(regexp)) {
      if (objects.has(label)) continue;
      objects.add(label);
      const fileUri = vscode.Uri.joinPath(folderUri, `${label}.ts`),
        isFile = await exists(fileUri);
      items.push({ label, picked: !isFile });
    }
    return objects.size !== 0
      ? ((await vscode.window.showQuickPick(items, options)) ?? [])
      : [];
  }

  async setUrl(url: string) {
    if (this.url === url) return;
    this.url = url;
    this.folder = this.urlFolder;
    this.typesUri = vscode.Uri.joinPath(typesFolderUri, this.folder);
    this.typesFileUri = vscode.Uri.joinPath(this.typesUri, "types.ts");
    this.busObjectsUri = vscode.Uri.joinPath(this.typesUri, "busobjects");
    this.busCompsUri = vscode.Uri.joinPath(this.typesUri, "buscomps");
    await writeFile(connectionShimFileUri, this.shimFile);
  }

  async pullBusObject(name: string, config: RestConfig) {
    const answer = await vscode.window.showInformationMessage(
      `Do you want to overwrite the business components for the ${name} business object?`,
      ...yesNo,
    );
    if (answer !== "Yes") return;
    await this.createBusObjectFile(name, config);
    await this.createTypesFile();
  }

  async pullBusComp(name: string, config: RestConfig) {
    const answer = await vscode.window.showInformationMessage(
      `Do you want to overwrite the fields for the ${name} business component?`,
      ...yesNo,
    );
    if (answer !== "Yes") return;
    await this.createBusCompFile(name, config);
    await this.createTypesFile();
  }

  async pullObjectsFromText(text: string, config: RestConfig) {
    const busObjects = await this.getSelectedItems(
        text,
        reBusObject,
        this.busObjectsUri,
        busObjectOptions,
      ),
      busComps = await this.getSelectedItems(
        text,
        reBusComp,
        this.busCompsUri,
        busCompOptions,
      );

    for (const { label } of busObjects) {
      await this.createBusObjectFile(label, config);
    }

    for (const { label } of busComps) {
      await this.createBusCompFile(label, config);
    }

    await this.createTypesFile();
    vscode.window.showInformationMessage(
      "Finished getting Business Components and Fields!",
    );
  }
}

export const typeGenerator = TypeGenerator.getInstance();

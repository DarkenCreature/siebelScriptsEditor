import * as vscode from "vscode";
import { getScriptsOnDisk, getFileUri, writeFile, FileExt } from "./file";
import {
  fields,
  getObject,
  paths,
  joinPath,
  queryObject,
  putObject,
  APPLET,
  APPLICATION,
  BUSCOMP,
  SERVICE,
  getSearchQuery,
  Script,
  getPayload,
  RestConfig,
} from "./rest";
import { createValidateScriptName } from "./validation";

const projectInput = {
    placeHolder: "Enter the search string for the Siebel project name",
  } as const,
  projectOptions = {
    title: "Choose a project for the new business service",
    placeHolder: "Project name",
    canPickMany: false,
  } as const,
  serviceInput = {
    placeHolder: "Enter the name of the new business service",
  } as const,
  customScriptItem = {
    label: "Custom",
    description: "Create a custom server script",
  } as const,
  newScriptOptions = {
    placeHolder:
      "Choose the server script to be created or select Custom and enter its name",
    canPickMany: false,
  } as const,
  defaultScripts = {
    [SERVICE]: [
      {
        label: "Service_PreInvokeMethod",
        args: "MethodName, Inputs, Outputs",
        isPre: true,
      },
      {
        label: "Service_InvokeMethod",
        args: "MethodName, Inputs, Outputs",
      },
      {
        label: "Service_PreCanInvokeMethod",
        args: "MethodName, &CanInvoke",
        isPre: true,
      },
      { label: "(declarations)" },
    ],
    [BUSCOMP]: [
      {
        label: "BusComp_PreSetFieldValue",
        args: "FieldName, FieldValue",
        isPre: true,
      },
      { label: "BusComp_SetFieldValue", args: "FieldName" },
      {
        label: "BusComp_PreGetFieldValue",
        args: "FieldName, &FieldValue",
        isPre: true,
      },
      { label: "BusComp_PreCopyRecord", isPre: true },
      { label: "BusComp_CopyRecord" },
      { label: "BusComp_PreNewRecord", isPre: true },
      { label: "BusComp_NewRecord" },
      { label: "BusComp_PreAssociate", isPre: true },
      { label: "BusComp_Associate" },
      { label: "BusComp_PreDeleteRecord", isPre: true },
      { label: "BusComp_DeleteRecord" },
      { label: "BusComp_PreWriteRecord", isPre: true },
      { label: "BusComp_WriteRecord" },
      { label: "BusComp_ChangeRecord" },
      { label: "BusComp_PreQuery", isPre: true },
      { label: "BusComp_Query" },
      {
        label: "BusComp_PreInvokeMethod",
        args: "MethodName",
        isPre: true,
      },
      { label: "BusComp_InvokeMethod", args: "MethodName" },
      { label: "(declarations)" },
    ],
    [APPLET]: [
      {
        label: "WebApplet_PreInvokeMethod",
        args: "MethodName",
        isPre: true,
      },
      { label: "WebApplet_InvokeMethod", args: "MethodName" },
      {
        label: "WebApplet_ShowControl",
        args: "ControlName, Property, Mode, &HTML",
      },
      {
        label: "WebApplet_ShowListColumn",
        args: "ColumnName, Property, Mode, &HTML",
      },
      {
        label: "WebApplet_PreCanInvokeMethod",
        args: "MethodName, &CanInvoke",
        isPre: true,
      },
      { label: "WebApplet_Load" },
      { label: "(declarations)" },
    ],
    [APPLICATION]: [
      { label: "Application_Start", args: "CommandLine" },
      { label: "Application_Close" },
      {
        label: "Application_PreInvokeMethod",
        args: "MethodName",
        isPre: true,
      },
      {
        label: "Application_InvokeMethod",
        args: "MethodName",
      },
      {
        label: "Application_PreNavigate",
        args: "DestViewName, DestBusObjName",
        isPre: true,
      },
      { label: "Application_Navigate" },
      { label: "(declarations)" },
    ],
  } as const;

const getNewScriptBody = ({
  label,
  args = "",
  isPre = false,
}: {
  label: string;
  args?: string;
  isPre?: boolean;
}) =>
  label !== "(declarations)"
    ? `function ${label}(${args})\n{\n${isPre ? "\treturn (ContinueOperation);" : ""}\n}`
    : "";

export const createNewScript = async (
  folderUri: vscode.Uri,
  type: Script,
  parent: string,
  fileExtension: FileExt = "js",
) => {
  const files = await getScriptsOnDisk(folderUri),
    items: (vscode.QuickPickItem & {
      args?: string;
      isPre?: boolean;
    })[] = [customScriptItem] as const;
  for (const item of defaultScripts[type]) {
    if (files.has(item.label)) continue;
    items.push(item);
  }
  const answer = await vscode.window.showQuickPick(items, {
    title: `New script for ${parent}`,
    ...newScriptOptions,
  });
  if (!answer) return;
  const isCustom = answer.label === "Custom",
    label = isCustom
      ? await vscode.window.showInputBox({
          placeHolder: "Enter the name of the new server script",
          validateInput: createValidateScriptName(files),
        })
      : answer.label;
  if (!label) return;
  const name = isCustom ? { label } : answer,
    content = getNewScriptBody(name),
    fileUri = getFileUri(folderUri, label, fileExtension);
  await writeFile(fileUri, content);
  return fileUri;
};

export const createNewService = async (
  config: RestConfig,
  objectFolderUri: vscode.Uri,
) => {
  const searchString = await vscode.window.showInputBox(projectInput);
  if (!searchString) return;
  const query = getSearchQuery(fields.name, searchString),
    projectResponse = await getObject(config, paths.project, query),
    items = [];
  for (const { Name: label } of projectResponse) {
    items.push({ label });
  }
  if (items.length === 0) {
    vscode.window.showErrorMessage(
      `No project name starts with the specified string "${searchString}"!`,
    );
    return;
  }
  const project = await vscode.window.showQuickPick(items, projectOptions);
  if (!project) return;
  const service = await vscode.window.showInputBox(serviceInput),
    serviceTrimmed = service && service.trim();
  if (!serviceTrimmed) return;
  const path = joinPath(SERVICE, serviceTrimmed),
    serviceResponse = await getObject(config, path, queryObject.testConnection),
    isService = serviceResponse.length !== 0;
  if (isService) {
    vscode.window.showErrorMessage(
      `Business service ${serviceTrimmed} already exists!`,
    );
    return;
  }
  const payload = getPayload(serviceTrimmed, fields.projectName, project.label),
    isSuccess = await putObject(config, path, payload);
  if (!isSuccess) return;
  const folderUri = vscode.Uri.joinPath(objectFolderUri, serviceTrimmed),
    fileUri = getFileUri(
      folderUri,
      defaultScripts[SERVICE][0].label,
      config.fileExtension,
    ),
    content = getNewScriptBody(defaultScripts[SERVICE][0]);
  await writeFile(fileUri, content);
  return [serviceTrimmed, fileUri] as const;
};

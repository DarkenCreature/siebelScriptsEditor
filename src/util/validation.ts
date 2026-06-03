import { OnDisk } from "./file";
import { SERVICE, BUSCOMP, APPLET, APPLICATION, WEBTEMP, Script, WebTemp, RestConfig } from "./rest";

const reWorkspace = /^[A-Za-z0-9_-]+$/,
  reIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const isWorkspaceEditable = (workspace: string, config: RestConfig) =>
  workspace.includes(`_${config.username.toLowerCase()}_`);

export const createValidateWorkspaceName =
  (workspaces: string[]) => async (value: string) => {
    const parts = value.split("_");
    if (
      !value ||
      !reWorkspace.test(value) ||
      parts.length === 1 ||
      (parts.length === 2 && parts[1] === "")
    )
      return "Invalid workspace name!";
    if (workspaces.includes(value)) return "Workspace already exists!";
    return "";
  };

export const isFileNameValid = (name: string) =>
  reIdentifier.test(name) || name === "(declarations)";

export const createValidateScriptName = (files: OnDisk) => (value: string) =>
  isFileNameValid(value)
    ? files.has(value)
      ? "Script already exists!"
      : ""
    : "Invalid script name!";

export const isScriptNameValid = (name: string, content: string) =>
  new RegExp(`function\\s+${name}\\s*\\(`).test(content) ||
  name === "(declarations)";

export const isTypeScript = (type: string): type is Script =>
  type === SERVICE ||
  type === BUSCOMP ||
  type === APPLET ||
  type === APPLICATION;

export const isTypeWebTemp = (type: string): type is WebTemp =>
  type === WEBTEMP;

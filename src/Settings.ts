import * as vscode from "vscode";

const get = <T extends keyof AllSettings>(name: T) =>
  <AllSettings[T]>(
    vscode.workspace.getConfiguration("siebelScriptAndWebTempEditor").get(name)
  );

const set = async <T extends keyof AllSettings>(
  name: T,
  value: AllSettings[T]
) =>
  await vscode.workspace
    .getConfiguration("siebelScriptAndWebTempEditor")
    .update(name, value, vscode.ConfigurationTarget.Global);

const refresh = <T extends keyof ExtensionSettings>(name: T) =>
  (settings[name] = get(name));

export const settings: ExtensionSettings = {
  connections: get("connections"),
  defaultConnectionName: get("defaultConnectionName"),
  singleFileAutoDownload: get("singleFileAutoDownload"),
  localFileExtension: get("localFileExtension"),
  defaultScriptFetching: get("defaultScriptFetching"),
  maxPageSize: get("maxPageSize"),
  defaultActionWhenFileExists: get("defaultActionWhenFileExists"),
};

export const getConnection = (name: string) => {
  for (const connection of settings.connections) {
    if (connection.name === name) return connection;
  }
  return <Config>{};
};

export const setConnections = async (newConnections: Config[]) =>
  await set("connections", newConnections);

export const setDefaultConnectionName = async (newName: string) =>
  await set("defaultConnectionName", newName);

export const configChange = (e: vscode.ConfigurationChangeEvent) => {
  if (!e.affectsConfiguration("siebelScriptAndWebTempEditor")) return false;
  for (const name of <(keyof ExtensionSettings)[]>Object.keys(settings)) {
    if (!e.affectsConfiguration(`siebelScriptAndWebTempEditor.${name}`))
      continue;
    refresh(name);
    return name === "connections" || name === "maxPageSize";
  }
};

export const moveDeprecatedSettings = async () => {
  try {
    const oldConnections = get("REST EndpointConfigurations"),
      connections = settings.connections;
    if (!oldConnections || connections.length !== 0) return;
    const workspaces = get("workspaces") ?? [],
      defaultConnection = get("defaultConnection"),
      newConnections: Config[] = [],
      workspaceObject: Record<string, string[]> = {};
    let isDefault = false;
    const [defaultConnectionName = "", defaultWorkspace = ""] =
      defaultConnection?.split(":") ?? [];
    for (const workspace of workspaces) {
      const [name, workspaceString] = workspace.split(":");
      workspaceObject[name] = workspaceString ? workspaceString.split(",") : [];
    }
    for (const config of oldConnections) {
      const [connUserPwString, url] = config.split("@"),
        [name, username, password] = connUserPwString?.split("/"),
        connection = {
          name,
          username,
          password,
          url,
          workspaces: workspaceObject[name] ?? [],
          restWorkspaces: false,
          defaultWorkspace: workspaceObject[name][0] ?? "",
        };
      if (
        name === defaultConnectionName &&
        workspaceObject[name].includes(defaultWorkspace)
      ) {
        connection.defaultWorkspace = defaultWorkspace;
        isDefault = true;
      }
      newConnections.push(connection);
    }
    await setConnections(newConnections);
    await setDefaultConnectionName(
      isDefault ? defaultConnectionName : newConnections[0].name
    );
    await set("REST EndpointConfigurations", undefined);
    await set("workspaces", undefined);
    await set("defaultConnection", undefined);
    await set("getWorkspacesFromREST", undefined);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `An error occured when moving the deprecated parameters to the new settings: ${err.message}, please create connections manually!`
    );
  }
};

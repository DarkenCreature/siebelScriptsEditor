import * as vscode from "vscode";
import { setupWorkspaceFolder } from "./util/file";
import { webView } from "./view/webView";
import { activeEditor } from "./editor/activeEditor";
import { treeView } from "./tree/treeView";

export async function activate({
  extensionUri,
  subscriptions,
}: vscode.ExtensionContext) {
  try {
    await setupWorkspaceFolder(extensionUri);
    webView.init(subscriptions, extensionUri);
    treeView.init(subscriptions);
    activeEditor.init(subscriptions);
  } catch (err: any) {
    vscode.window.showErrorMessage(err.message);
  }
}

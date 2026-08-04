import * as vscode from "vscode";

export const contextValues = {
    serviceManager: "serviceManager",
    manager: "manager",
    object: "objectItem",
    child: "childItem",
    busComp: "busCompItem",
    busObject: "busObjectItem",
    busObjectBusComp: "busObjectBusComp",
  } as const,
  itemStates = {
    offline: {
      icon: new vscode.ThemeIcon("library"),
      tooltip: "Showing objects on disk",
    },
    online: {
      icon: new vscode.ThemeIcon("plug", new vscode.ThemeColor("charts.green")),
      tooltip: "Showing data from Siebel",
    },
    disk: {
      icon: new vscode.ThemeIcon(
        "device-desktop",
        new vscode.ThemeColor("charts.blue"),
      ),
      tooltip: "On disk",
    },
    siebel: {
      icon: new vscode.ThemeIcon(
        "cloud",
        new vscode.ThemeColor("charts.yellow"),
      ),
      tooltip: "In Siebel",
    },
    same: {
      icon: new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("charts.green"),
      ),
      tooltip: "Synchronized",
    },
    differ: {
      icon: new vscode.ThemeIcon(
        "request-changes",
        new vscode.ThemeColor("charts.red"),
      ),
      tooltip: "Modified",
    },
  } as const,
  selectCommand = {
    command: "siebelscriptandwebtempeditor.selectTreeItem",
    title: "Select",
  } as const;

export type ItemState = (typeof itemStates)[keyof typeof itemStates];

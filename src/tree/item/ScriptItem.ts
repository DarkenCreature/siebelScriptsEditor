import { treeView } from "../treeView";
import { fields, queryObject } from "../../util/rest";
import { ChildItem } from "./ChildItem";
import { ObjectItem } from "./ObjectItem";
import { FileExt } from "../../util/file";

export class ScriptItem extends ChildItem<ObjectItem> {
  readonly field = fields.script;
  readonly params = queryObject.pullScript;

  get ext(): FileExt {
    return this.parent.onDisk.get(this.label) ?? treeView.config.fileExtension;
  }

  refresh() {
    this.parent.setState();
    treeView.refresh(this.parent);
  }
}

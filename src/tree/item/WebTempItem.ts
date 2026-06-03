import { treeView } from "../treeView";
import { fields, queryObject } from "../../util/rest";
import { WebTempManager } from "../manager/WebTempManager";
import { ChildItem } from "./ChildItem";
import { FileExt } from "../../util/file";

export class WebTempItem extends ChildItem<WebTempManager> {
  readonly field = fields.definition;
  readonly params = queryObject.pullDefinition;

  get ext(): FileExt {
    return "html";
  }

  refresh() {
    treeView.refresh(this);
  }
}

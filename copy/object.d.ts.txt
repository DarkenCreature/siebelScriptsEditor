import { BusObjMap, BusCompMap } from "./connection-shim";

declare global {
  type OOBFields = "Id" | "Created" | "Created By" | "Updated" | "Updated By";

  type BusCompFieldType<F> = OOBFields | F;

  interface TheApplication {
    GetBusObject<BO extends keyof BusObjMap>(name: BO): BusObjectT<BO>;
  }

  interface BusObject {
    GetBusComp<BC extends keyof BusCompMap>(name: BC): BusCompT<BusCompMap[BC]>;
  }

  interface BusObjectT<BO extends keyof BusObjMap> extends BusObject {
    GetBusComp<BC extends BusObjMap[BO]>(
      name: BC
    ): BC extends keyof BusCompMap ? BusCompT<BusCompMap[BC]> : BusComp;
  }

  interface BusCompT<F extends BusCompMap[keyof BusCompMap]>
    extends BusComp {
    ActivateField(fieldName: F): void;
    GetFieldValue(fieldName: F): string;
    GetFormattedFieldValue(fieldName: F): string;
    SetFieldValue(fieldName: F, fieldValue: string | number): void;
    SetFormattedFieldValue(fieldName: F, fieldValue: string): void;
    SetSearchSpec(fieldName: F, fieldValue: string): void;
  }
}

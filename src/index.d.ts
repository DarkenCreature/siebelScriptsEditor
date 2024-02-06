//Siebel object types
type SiebelObject =
  | "service"
  | "buscomp"
  | "applet"
  | "application"
  | "webtemp";

type NotWebTemp = Exclude<SiebelObject, "webtemp">;

//Connections object
type Connections = Record<
  string,
  Connection & {
    workspaces: string[];
  }
>;

//Connection parameters
type Connection = {
  username: string;
  password: string;
  url: string;
};

//Workspaces object
type Workspaces = Record<string, string[]>;

//Data objects the tree views
type ScriptObject = Record<string, Scripts>;
type Scripts = Record<string, boolean>;
type WebTempObject = Record<string, boolean>;

//Query parameters
type QueryParams = {
  searchSpec?: string;
  workspace?: "MAIN";
  fields?: "Name" | "Script" | "Definition" | "Name,Script";
  pageSize?: 100;
  childLinks?: "None";
  uniformresponse?: "y";
};

//Response scripts from Siebel
type ScriptResponse = {
  Name: string;
  Script?: string;
};

//Response web templates from Siebel
type WebTempResponse = {
  Name: string;
  Definition?: string;
};

type InfoObject = {
  "folder created at": string;
  connection: string;
  workspace: string;
  type: SiebelObject;
  files: Record<string, PullPushDate>;
  siebelObjectName?: string;
  scripts?: Record<string, PullPushDate>;
  definitions?: Record<string, PullPushDate>;
};

//date fields in the info.json
type PullPushDate = {
  "last update from Siebel": string;
  "last push to Siebel": string;
};

//payload when upserting script/web template into Siebel
type Payload = {
  Name: string;
  Script?: string;
  Definition?: string;
  "Program Language"?: "JS";
};

//message object sent from the webview
type Message = {
  command: MessageCommand;
  connectionName: string;
  workspace: string;
  object: SiebelObject;
  searchString: string;
};

type MessageCommand =
  | "connection"
  | "workspace"
  | "object"
  | "search"
  | "openConfig";

//REST methods
type GET = "get";
type PUT = "put";

//Button actions
type PUSH = "push";
type PULL = "pull";

//REST methods
type RestMethod = GET | PUT;

//Button actions
type ButtonAction = PUSH | PULL;

//Settings
type Settings = {
  connections: Record<string, string>;
  singleFileAutoDownload: boolean;
  localFileExtension: ".js" | ".ts";
  defaultScriptFetching:
    | "Yes"
    | "No"
    | "Only method names"
    | "All scripts"
    | "None - always ask"
    | undefined;
};

//overloaded function interfaces
interface IAxiosInstance {
  (
    { url, username, password }: Connection,
    method: "get",
    paramsOrPayload: QueryParams
  ): Promise<any[]>;
  (
    { url, username, password }: Connection,
    method: "put",
    paramsOrPayload: Payload
  ): Promise<number>;
}

interface IGetDataFromSiebel {
  (url: string, fields: "Name", searchSpec: string): Promise<
    ScriptResponse[] | WebTempResponse[]
  >;
  (url: string, fields: "Name" | "Name,Script" | "Script"): Promise<
    ScriptResponse[]
  >;
  (url: string, fields: "Definition"): Promise<WebTempResponse[]>;
}

//Deprecated settings
type OldSettings = {
  "REST EndpointConfigurations": string[];
  workspaces: string[];
  getWorkspacesFromREST: boolean;
  defaultConnection: string;
};

export function runtimeRequirement(app:string):{version:string;sha256:string;licenseSha256:string}|null;
export function runtimeExecutable(app:string):string;
export function ensureRuntime(app?:string):void|Promise<never>;
export function promoteRuntime(app:string):Promise<boolean>;

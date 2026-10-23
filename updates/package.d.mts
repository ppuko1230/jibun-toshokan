export function newer(a:string,b:string):boolean;
export function verifyPackage(file:string,publicKey:Uint8Array,edition:string,currentVersion:string|null):{manifest:{version:string;edition:string;files:{path:string;bytes:number;sha256:string}[]};entries:Map<string,Buffer>};

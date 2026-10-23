import {readFileSync,writeFileSync,mkdirSync,unlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {verifyPackage,newer} from './updates/package.mjs';

// Only public, textbook-free shared releases are published. Startup may check the
// small public feed; downloading/installing remains an explicit user action.
export const updateRepository='ppuko1230/jibun-toshokan-releases';
const releaseRoot='https://github.com/'+updateRepository+'/releases';
const MAX_PACKAGE=200*1024*1024;
type Feed={format:'yohaku-release-v1';version:string;edition:'shared';sha256:string};
export type OnlineRelease={available:boolean;version:string;currentVersion:string;edition:string};
function current(app:string){return JSON.parse(readFileSync(join(app,'release.json'),'utf8'));}
export function validDownloadUrl(value:string){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))throw Error('更新ファイルの配信先を確認できません。');
  if(url.hostname==='github.com'&&!url.pathname.startsWith('/'+updateRepository+'/releases/'))throw Error('このアプリの配信先ではありません。');
  return url;
}
async function download(url:string,limit:number,fetcher:typeof fetch=fetch,timeoutMs=120000){
  const timeout=AbortSignal.timeout(timeoutMs);let target=validDownloadUrl(url);
  for(let hop=0;hop<5;hop++){
    const response=await fetcher(target,{method:'GET',redirect:'manual',headers:{'User-Agent':'Jibun-Toshokan-Updater','Accept':'application/octet-stream'},signal:timeout}).catch(()=>{throw Error('更新を取得できませんでした。インターネット接続を確認してください。');});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;target=validDownloadUrl(new URL(location,target).href);continue;}
    if(response.status===404){await response.body?.cancel();throw Error('更新版はまだ公開されていません。しばらくしてから確認してください。');}
    if(!response.ok||!response.body){await response.body?.cancel();throw Error('更新を取得できませんでした。インターネット接続を確認してください。');}
    if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw Error('更新ファイルが大きすぎます。');}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>limit)throw Error('更新ファイルが大きすぎます。');chunks.push(next.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    return Buffer.concat(chunks);
  }
  throw Error('更新ファイルの配信先を確認できません。');
}
async function feed(app:string,fetcher:typeof fetch,noticeOnly=false,timeoutMs=120000){
  const installed=current(app);if(installed.edition!=='shared'&&(!noticeOnly||installed.edition!=='personal'))throw Error('オンライン更新は空の本棚の配布版で利用できます。');
  const raw=await download(releaseRoot+'/latest/download/jibun-toshokan-release.json',16384,fetcher,timeoutMs);let value:Feed;
  try{value=JSON.parse(raw.toString('utf8'));}catch{throw Error('更新情報の形式が正しくありません。');}
  if(!value||value.format!=='yohaku-release-v1'||value.edition!=='shared'||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('更新情報の形式が正しくありません。');
  // newer validates both version strings even when no update is available.
  const available=newer(value.version,installed.version);
  return {value,result:{available,version:value.version,currentVersion:installed.version,edition:installed.edition} as OnlineRelease};
}
export async function checkOnlineUpdate(app:string,fetcher:typeof fetch=fetch){return (await feed(app,fetcher)).result;}
export async function checkStartupUpdate(app:string,fetcher:typeof fetch=fetch,timeoutMs=5000){return (await feed(app,fetcher,true,timeoutMs)).result;}
export async function downloadOnlineUpdate(app:string,dataRoot:string,fetcher:typeof fetch=fetch){
  const {value,result}=await feed(app,fetcher);if(!result.available)throw Error('すでに最新の版です。');
  const bytes=await download(releaseRoot+'/download/v'+value.version+'/jibun-toshokan-update.zip',MAX_PACKAGE,fetcher);
  if(createHash('sha256').update(bytes).digest('hex')!==value.sha256)throw Error('更新ファイルが破損しています。もう一度確認してください。');
  const folder=join(dirname(dataRoot),'downloads');mkdirSync(folder,{recursive:true});
  const file=join(folder,'yohaku-'+randomUUID()+'.zip');
  try{writeFileSync(file,bytes,{flag:'wx'});const verified=verifyPackage(file,readFileSync(join(app,'updates/public-key.pem')),'shared',result.currentVersion);if(verified.manifest.version!==value.version)throw Error('更新の版番号が一致しません。');return {...result,file,token:randomUUID()};}
  catch(error){if(existsSync(file))unlinkSync(file);throw error;}
}

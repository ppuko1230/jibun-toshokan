import {checkStartupUpdate,type OnlineRelease} from './online-update';

// Cache only version metadata in this server process, never learning data.
// Simultaneous windows share one request; failure is silent and backs off.
export function createStartupUpdateCheck(app:string,options:{fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number}={}){
  const now=options.now||Date.now;
  let release:OnlineRelease|null=null,nextCheck=0,pending:Promise<OnlineRelease|null>|null=null;
  return async function(enabled:boolean){
    if(!enabled)return {enabled:false,release:null};
    if(now()<nextCheck)return {enabled:true,release};
    if(!pending)pending=checkStartupUpdate(app,options.fetcher,options.timeoutMs).then(value=>{release=value;nextCheck=now()+30*60*1000;return value;}).catch(()=>{release=null;nextCheck=now()+5*60*1000;return null;}).finally(()=>{pending=null;});
    return {enabled:true,release:await pending};
  };
}

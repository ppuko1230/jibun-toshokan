import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,renameSync,readdirSync,lstatSync,unlinkSync,openSync,closeSync,realpathSync} from 'node:fs';
import {resolve,join,sep,dirname} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {verifyPackage,digest,managedPath} from './package.mjs';
import {runtimeExecutable} from '../public/runtime/bootstrap.mjs';
const publicKey=readFileSync(new URL('./public-key.pem',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fail(message){throw Error(message);}
function json(path){return JSON.parse(readFileSync(path,'utf8').replace(/^\ufeff/,''));}
function atomic(path,bytes){mkdirSync(dirname(path),{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';writeFileSync(tmp,bytes);renameSync(tmp,path);}
function safeChild(root,relative){const p=resolve(root,relative);if(!p.startsWith(resolve(root)+sep))fail('保存先の範囲が正しくありません。');let at=dirname(p);while(at.startsWith(resolve(root)+sep)){if(existsSync(at)&&lstatSync(at).isSymbolicLink())fail('リンクを含む保存先は更新できません。');at=dirname(at);}if(existsSync(p)&&lstatSync(p).isSymbolicLink())fail('リンクを含む保存先は更新できません。');return p;}
function copyTree(source,target){mkdirSync(target,{recursive:true});for(const item of readdirSync(source,{withFileTypes:true})){const from=safeChild(source,item.name),to=safeChild(target,item.name);if(item.isSymbolicLink())fail('データ内のリンクを確認してください。');if(item.isDirectory())copyTree(from,to);else if(item.isFile())copyFileSync(from,to);else fail('コピーできないファイルがあります。');}}
function treeHashes(root,prefix=''){const files=[];for(const item of readdirSync(root,{withFileTypes:true})){const name=prefix+item.name,path=safeChild(root,item.name);if(item.isSymbolicLink())fail('データ内のリンクを確認してください。');if(item.isDirectory())files.push(...treeHashes(path,name+'/'));else if(item.isFile())files.push([name,digest(readFileSync(path))]);}return files.sort((a,b)=>a[0].localeCompare(b[0]));}
function editionAt(app){if(existsSync(join(app,'release.json')))return json(join(app,'release.json')).edition;if(existsSync(join(app,'edition.json')))return json(join(app,'edition.json')).edition;return 'personal';}
function currentVersion(app){return existsSync(join(app,'release.json'))?json(join(app,'release.json')).version:null;}
function configAt(app){const path=join(app,'installation.json');if(!existsSync(path))return null;const c=json(path);if(c.format!=='yohaku-installation-v1'||!['personal','shared'].includes(c.edition)||!/^[-a-zA-Z0-9]{1,80}$/.test(c.instanceId)||!c.dataRoot||resolve(c.dataRoot)!==c.dataRoot||!Number.isInteger(c.port)||c.port<1024||c.port>65535)fail('本棚の保存先設定を確認してください。');return c;}
function legacyConfig(app,options){const edition=editionAt(app),idFile=join(app,'data/installation-id.txt');return {format:'yohaku-installation-v1',edition,port:options.port|| (edition==='shared'?43147:43127),instanceId:existsSync(idFile)?readFileSync(idFile,'utf8').trim():randomUUID(),dataRoot:join(app,'data')};}
async function status(port){try{const r=await fetch(`http://127.0.0.1:${port}/api/local-status`,{headers:{Connection:'close'},signal:AbortSignal.timeout(1000)});if(!r.ok)fail('この通信ポートは別のアプリが使用しています。');return r.json();}catch(e){if(e.name==='TypeError'||e.name==='TimeoutError')return null;throw e;}}
function ownsProcess(app,state,config){
  if(state.app!=='yohaku-local')return false;
  if(state.appRoot)return resolve(state.appRoot).toLowerCase()===app.toLowerCase()&&(!state.instanceId||state.instanceId===config.instanceId);
  if(!Number.isInteger(state.pid))return false;
  // Bootstrap older editions without trusting a PID alone.
  const script='$p=Get-CimInstance Win32_Process -Filter ("ProcessId = "+$env:YOHAKU_CHECK_PID); if($p -and $p.CommandLine -and $p.CommandLine.ToLowerInvariant().Contains($env:YOHAKU_CHECK_SERVER.ToLowerInvariant())){[Console]::Write("owned")}';
  return execFileSync('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',env:{...process.env,YOHAKU_CHECK_PID:String(state.pid),YOHAKU_CHECK_SERVER:join(app,'server.mjs')}}).trim()==='owned';
}
async function request(config,path,method='GET'){const origin=`http://127.0.0.1:${config.port}`,r=await fetch(origin+'/api/'+path,{method,headers:{Connection:'close',...(method==='GET'?{}:{Origin:origin})},signal:AbortSignal.timeout(60000)});if(!r.ok)fail((await r.json()).error||'本棚との通信に失敗しました。');return r.json();}
async function stopServer(app,config){const state=await status(config.port);if(!state)return;if(!ownsProcess(app,state,config))fail('別の本棚が起動しています。そちらを終了してください。');await request(config,'shutdown','POST');for(let i=0;i<100;i++){let alive=false;try{process.kill(state.pid,0);alive=true;}catch{}if(!alive&&!await status(config.port))return;await sleep(100);}fail('本棚を終了できませんでした。');}
function startServer(app,config,checking=false){
  mkdirSync(config.dataRoot,{recursive:true});const out=openSync(join(config.dataRoot,'startup.log'),'a'),err=openSync(join(config.dataRoot,'error.log'),'a');
  const processEnv={...process.env,YOHAKU_APP_ROOT:app,YOHAKU_DATA_DIR:config.dataRoot,YOHAKU_INSTANCE_ID:config.instanceId,YOHAKU_PORT:String(config.port),YOHAKU_UPDATE_CHECK:checking?'1':'0'};
  const child=spawn(runtimeExecutable(app),['--disable-warning=ExperimentalWarning',join(app,'server.mjs')],{cwd:app,env:processEnv,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.unref();closeSync(out);closeSync(err);return child.pid;
}
async function waitReady(app,config,expected){for(let i=0;i<60;i++){const state=await status(config.port);if(state){if(!ownsProcess(app,state,config))fail('別の本棚が起動しました。');if(expected&&state.appVersion!==expected)fail('更新後の版番号が一致しません。');return state;}await sleep(200);}fail('本棚を起動できませんでした。error.logを確認してください。');}
function ensureStorage(app,options={}){
  const existing=configAt(app);if(existing)return existing;
  const c=legacyConfig(app,options),base=resolve(options.storageBase||join(process.env.LOCALAPPDATA||fail('利用者の保存フォルダーが見つかりません。'),'Yohaku','Libraries'));
  mkdirSync(base,{recursive:true});let profile=safeChild(base,c.instanceId);if(existsSync(profile)){c.instanceId=randomUUID();profile=safeChild(base,c.instanceId);}
  const stage=safeChild(base,c.instanceId+'.copying-'+randomUUID()),legacy=join(app,'data');mkdirSync(join(stage,'data'),{recursive:true});
  if(existsSync(legacy)){copyTree(legacy,join(stage,'data'));if(!isDeepStrictEqual(treeHashes(legacy),treeHashes(join(stage,'data'))))fail('データのコピーが一致しないため、保存先を切り替えませんでした。');}
  renameSync(stage,profile);c.dataRoot=join(profile,'data');atomic(join(app,'installation.json'),JSON.stringify(c,null,2));return c;
}
function oldFiles(app,paths){return paths.map(path=>({path,existed:existsSync(safeChild(app,path))}));}
function backupApp(app,backup,files){for(const f of files)if(f.existed){const to=safeChild(backup,'app/'+f.path);mkdirSync(dirname(to),{recursive:true});copyFileSync(safeChild(app,f.path),to);}}
function restoreApp(app,state){for(const f of state.files){if(!managedPath(f.path))fail('復帰用の一覧が正しくありません。');const target=safeChild(app,f.path);if(f.existed)atomic(target,readFileSync(safeChild(state.backup,'app/'+f.path)));else if(existsSync(target))unlinkSync(target);}if(state.oldConfig===null){if(existsSync(join(app,'installation.json')))unlinkSync(join(app,'installation.json'));}else atomic(join(app,'installation.json'),Buffer.from(state.oldConfig,'base64'));}
async function recover(app){
  const path=join(app,'.update-state.json');if(!existsSync(path))return;
  const state=json(path);if(state.phase==='complete'||state.phase==='rolled-back')return;
  if(state.managerPid!==process.pid){let alive=false;try{process.kill(state.managerPid,0);alive=true;}catch{}if(alive)fail('更新中です。完了してから開いてください。');}
  if(state.app!==app||!state.backup||!state.files)fail('中断した更新の控えを確認してください。');
  const live=await status(state.config.port);if(live){if(live.pid===state.managerPid)fail('更新中です。');await stopServer(app,state.config);}
  restoreApp(app,state);state.phase='rolled-back';atomic(path,JSON.stringify(state,null,2));startServer(app,state.oldStorage);await waitReady(app,state.oldStorage,null);
}
function takeLock(app){
  const path=join(app,'.update-lock.json');
  if(existsSync(path)){const lock=json(path);let alive=false;try{process.kill(lock.pid,0);alive=true;}catch{}if(alive)fail('ほかの更新が実行中です。');unlinkSync(path);}
  writeFileSync(path,JSON.stringify({pid:process.pid}),{flag:'wx'});return()=>{if(existsSync(path)&&json(path).pid===process.pid)unlinkSync(path);};
}
export async function startInstall(appPath,options={}){
  const app=realpathSync(resolve(appPath));await recover(app);const c=configAt(app)||legacyConfig(app,options),live=await status(c.port);
  if(live){if(!ownsProcess(app,live,c))fail('別の本棚が起動しています。そちらを終了してください。');if(live.appVersion===currentVersion(app)&&configAt(app))return live;await stopServer(app,c);}
  const config=ensureStorage(app,options);startServer(app,config);return waitReady(app,config,currentVersion(app));
}
export async function stopInstall(appPath,options={}){const app=realpathSync(resolve(appPath));await stopServer(app,configAt(app)||legacyConfig(app,options));}
export async function updateInstall(appPath,packagePath,options={}){
  const app=realpathSync(resolve(appPath)),edition=editionAt(app),verified=verifyPackage(packagePath,publicKey,edition,currentVersion(app));
  const unlock=takeLock(app);
  let state,oldStorage,before,stopped=false,oldConfiguration;
  try{
    await recover(app);oldStorage=configAt(app)||legacyConfig(app,options);const live=await status(oldStorage.port);
    if(live&&!ownsProcess(app,live,oldStorage))fail('別の本棚が起動しています。そちらを終了してください。');
    if(!live){startServer(app,oldStorage);await waitReady(app,oldStorage,null);}
    const running=await status(oldStorage.port);
    before=running.updateProtocol===1?(await request(oldStorage,'update-lock','POST')).backup:await request(oldStorage,'backup');
    await stopServer(app,oldStorage);stopped=true;
    const oldConfig=existsSync(join(app,'installation.json'))?readFileSync(join(app,'installation.json')).toString('base64'):null;oldConfiguration=oldConfig;
    const config=ensureStorage(app,options),backup=join(dirname(config.dataRoot),'updates',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());mkdirSync(backup,{recursive:true});
    writeFileSync(join(backup,'before.json'),JSON.stringify(before));copyTree(config.dataRoot,join(backup,'data'));
    const paths=verified.manifest.files.map(f=>f.path),files=oldFiles(app,paths);backupApp(app,backup,files);
    state={app,config,oldStorage,oldConfig,backup,files,phase:'applying',managerPid:process.pid,managerRuntime:process.execPath,version:verified.manifest.version};atomic(join(app,'.update-state.json'),JSON.stringify(state,null,2));
    for(const f of verified.manifest.files){const target=safeChild(app,f.path);if(existsSync(target)&&digest(readFileSync(target))===f.sha256)continue;atomic(target,verified.entries.get(f.path));}
    startServer(app,config,true);await waitReady(app,config,verified.manifest.version);
    const after=await request(config,'backup'),clean=v=>{const c=structuredClone(v);delete c.exportedAt;return c;};
    if(!isDeepStrictEqual(clean(after),clean(before)))fail('更新前後の学習データが一致しません。アプリを旧版へ戻します。');
    await request(config,'update-unlock','POST');state.phase='complete';atomic(join(app,'.update-state.json'),JSON.stringify(state,null,2));
    const result={updated:true,version:state.version,dataPreserved:true,dataRoot:config.dataRoot,backup};writeFileSync(join(backup,'result.json'),JSON.stringify(result,null,2));return result;
  }catch(e){
    if(state){await stopServer(app,state.config);restoreApp(app,state);state.phase='rolled-back';state.error=e.message;atomic(join(app,'.update-state.json'),JSON.stringify(state,null,2));startServer(app,state.oldStorage);await waitReady(app,state.oldStorage,null);}
    else if(stopped&&oldStorage){if(oldConfiguration===null&&existsSync(join(app,'installation.json')))unlinkSync(join(app,'installation.json'));else if(oldConfiguration)atomic(join(app,'installation.json'),Buffer.from(oldConfiguration,'base64'));startServer(app,oldStorage);await waitReady(app,oldStorage,null);}
    else if(oldStorage){try{await request(oldStorage,'update-unlock','POST');}catch{}}
    throw e;
  }finally{unlock();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),command=args.shift(),get=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
  const app=get('app')||resolve(import.meta.dirname,'..'),options={storageBase:get('storage-base'),port:get('port')?Number(get('port')):undefined};
  const reportId=get('online-report'),report=(phase,value={})=>{if(!reportId||!/^[-a-zA-Z0-9]{1,80}$/.test(reportId))return;const config=configAt(app);if(config)atomic(join(dirname(config.dataRoot),'updates','online-result.json'),JSON.stringify({id:reportId,phase,...value}));};
  try{const result=command==='start'?await startInstall(app,options):command==='stop'?await stopInstall(app,options):command==='update'?await updateInstall(app,get('package')||fail('更新ZIPを選んでください。'),options):fail('操作を確認してください。');report('complete',{version:result?.version});console.log(JSON.stringify(result||{stopped:true}));}
  catch(e){report('error',{error:e.message});console.error(e.message);process.exitCode=1;}
}

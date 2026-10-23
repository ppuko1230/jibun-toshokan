import {webPage,challenges,saveChallenge} from './web-learning';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,resolve,sep,extname,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {promoteRuntime} from './runtime-bootstrap.mjs';
import {randomUUID} from 'node:crypto';
import {checkOnlineUpdate,downloadOnlineUpdate} from './online-update';
import {createStartupUpdateCheck} from './startup-update';
import {organizeLaunchers} from './launcher-layout';
import {GET,POST,PUT,DELETE} from './app/api/[...path]/route';
import {fullBackup,importBackup} from './backup';
import {appRoot,dataRoot,installation,sqlite,snapshot} from './local-store';
import {studyState,updateStudyState} from './study-state';
import {practiceData,updatePractice} from './code-practice';
import {clozeState,updateCloze,ClozeError} from './cloze-practice';
const port=Number(process.env.YOHAKU_PORT||43127);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');
const origin=`http://127.0.0.1:${port}`,publicRoot=join(appRoot,'public');
const startupUpdateCheck=createStartupUpdateCheck(appRoot);
let updating=process.env.YOHAKU_UPDATE_CHECK==='1';
let promotionStarted=false;
function finishRuntimeUpdate(){if(promotionStarted)return;promotionStarted=true;promoteRuntime(appRoot).catch(error=>console.error('Node.jsの切り替え：',error.message));}
let activeMutations=0;
let downloading=false,stagedUpdate:Awaited<ReturnType<typeof downloadOnlineUpdate>>|null=null;
const onlineReport=join(dirname(dataRoot),'updates','online-result.json');
const mime:Record<string,string>={'.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.pdf':'application/pdf','.svg':'image/svg+xml','.wasm':'application/wasm','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  let countedMutation=false;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  const send=(status:number,value:any)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
  try{
    const host=req.headers.host,requestOrigin=req.headers.origin;
    if(host!==`127.0.0.1:${port}`||req.headers['sec-fetch-site']==='cross-site'||(requestOrigin&&requestOrigin!==origin)||(!['GET','HEAD'].includes(req.method||'GET')&&requestOrigin!==origin)){send(403,{error:'このPCの自分図書館から開いてください。'});return;}
    const url=new URL(req.url||'/',origin),path=decodeURIComponent(url.pathname);
    if(path==='/api/local-status'){send(200,{app:'yohaku-local',version:1,appVersion:__YOHAKU_VERSION__,runtimeVersion:process.version,updateProtocol:1,storage:'pc',appRoot:resolve(appRoot),dataRoot,storageSeparated:!!installation&&dataRoot===installation.dataRoot,pid:process.pid,edition:__YOHAKU_SHARED__?'shared':'personal',instanceId:process.env.YOHAKU_INSTANCE_ID||installation?.instanceId||null});return;}
    if(path==='/api/update-lock'&&req.method==='POST'){updating=true;for(let i=0;activeMutations&&i<200;i++)await new Promise(r=>setTimeout(r,50));if(activeMutations){send(503,{error:'保存が続いています。保存を終えてからもう一度更新してください。'});return;}send(200,{backup:await fullBackup()});return;}
    if(path==='/api/update-unlock'&&req.method==='POST'){updating=false;finishRuntimeUpdate();send(200,{ready:true});return;}
    if(updating&&!['GET','HEAD'].includes(req.method||'GET')&&path!=='/api/shutdown'){send(503,{error:'アプリを更新しています。入力内容を残したまま、更新の完了をお待ちください。'});return;}
    if(!['GET','HEAD'].includes(req.method||'GET')&&path!=='/api/shutdown'){activeMutations++;countedMutation=true;}
    if(path==='/api/challenges'&&req.method==='GET'){send(200,{challenges:challenges()});return;}
    if(path==='/api/code-practice'&&req.method==='GET'){send(200,practiceData());return;}
    if(path==='/api/cloze-practice'&&req.method==='GET'){send(200,clozeState());return;}
    if(path.startsWith('/api/reading-map/')&&req.method==='GET'){try{const data=await webPage(path.slice('/api/reading-map/'.length),1);send(200,{chapters:data.chapters});}catch{send(404,{error:'教材が見つかりません。'});}return;}
    if(path.startsWith('/api/web-books/')&&req.method==='GET'){try{send(200,await webPage(path.slice('/api/web-books/'.length),Number(url.searchParams.get('page')||1)));}catch(e){send(400,{error:e instanceof Error?e.message:'本文を読み込めません。'});}return;}
    if(path==='/api/study-state'&&req.method==='GET'){send(200,studyState());return;}
    if(path==='/api/app-update/notice'&&req.method==='GET'){send(200,await startupUpdateCheck(studyState().updateCheckOnStart??true));return;}
    if(path==='/api/backup'&&req.method==='GET'){
      const result=await fullBackup();res.setHeader('Content-Disposition','attachment; filename="yohaku-full-backup-'+new Date().toISOString().slice(0,10)+'.json"');send(200,result);return;
    }
    if(path.startsWith('/api/')){
      const chunks:Buffer[]=[];let length=0;
      const limit=path==='/api/import'?100*1024*1024:path==='/api/upload'?28*1024*1024:100000;
      if(Number(req.headers['content-length']||0)>limit){send(413,{error:'ファイルが大きすぎます。'});return;}
      for await(const chunk of req){length+=chunk.length;if(length>limit){send(413,{error:'ファイルが大きすぎます。'});return;}chunks.push(chunk);}
      const body=chunks.length?Buffer.concat(chunks):undefined;
      if(path==='/api/app-update/check'&&req.method==='POST'){
        try{send(200,await checkOnlineUpdate(appRoot));}catch(error){send(400,{error:error instanceof Error?error.message:'更新を確認できませんでした。'});}return;
      }
      if(path==='/api/app-update/download'&&req.method==='POST'){
        if(downloading){send(409,{error:'更新をダウンロードしています。'});return;}
        downloading=true;
        try{const next=await downloadOnlineUpdate(appRoot,dataRoot);if(stagedUpdate&&existsSync(stagedUpdate.file))unlinkSync(stagedUpdate.file);stagedUpdate=next;send(200,{token:next.token,version:next.version});}
        catch(error){send(400,{error:error instanceof Error?error.message:'更新を取得できませんでした。'});}finally{downloading=false;}return;
      }
      if(path==='/api/app-update/install'&&req.method==='POST'){
        const input=JSON.parse(body?.toString('utf8')||'{}');
        if(!stagedUpdate||input.token!==stagedUpdate.token||!installation){send(400,{error:'更新ファイルをもう一度取得してください。'});return;}
        const job=stagedUpdate,id=randomUUID();stagedUpdate=null;
        mkdirSync(dirname(onlineReport),{recursive:true});writeFileSync(onlineReport,JSON.stringify({id,phase:'starting',version:job.version}));
        const worker=join(dirname(dataRoot),'updates','worker-'+id);mkdirSync(worker,{recursive:true});const workerRuntime=join(worker,'node.exe');writeFileSync(workerRuntime,readFileSync(process.execPath),{flag:'wx'});
        const child=spawn(workerRuntime,['--disable-warning=ExperimentalWarning',join(appRoot,'updates/manager.mjs'),'update','--app',appRoot,'--package',job.file,'--online-report',id],{cwd:appRoot,detached:true,windowsHide:true,stdio:'ignore'});
        try{await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();send(200,{id,version:job.version});}
        catch{writeFileSync(onlineReport,JSON.stringify({id,phase:'error',error:'更新プログラムを起動できませんでした。'}));send(500,{error:'更新プログラムを起動できませんでした。'});}return;
      }
      if(path==='/api/app-update/status'&&req.method==='GET'){
        try{const report=existsSync(onlineReport)?JSON.parse(readFileSync(onlineReport,'utf8')):null;send(200,{report});}catch{send(200,{report:null});}return;
      }
      if(path==='/api/cloze-practice'&&req.method==='POST'){try{snapshot();send(200,await updateCloze(JSON.parse(body?.toString('utf8')||'')));}catch(e){send(e instanceof ClozeError?e.status:400,{error:e instanceof Error?e.message:'問題を保存できませんでした。'});}return;}
      if(path==='/api/code-practice'&&req.method==='POST'){try{snapshot();send(200,updatePractice(JSON.parse(body?.toString('utf8')||'')));}catch(e){send(400,{error:e instanceof Error?e.message:'練習を保存できません。'});}return;}
      if((path==='/api/challenges'&&req.method==='POST')||(path.startsWith('/api/challenges/')&&req.method==='PUT')){try{snapshot();send(200,{challenge:await saveChallenge(JSON.parse(body?.toString('utf8')||''),req.method==='PUT'?path.slice('/api/challenges/'.length):undefined)});}catch(e){send(400,{error:e instanceof Error?e.message:'課題を保存できません。'});}return;}
      if(path==='/api/study-state'&&req.method==='PUT'){
        try{snapshot();send(200,await updateStudyState(JSON.parse(body?.toString('utf8')||'')));}catch(e){send(400,{error:e instanceof Error?e.message:'保存できませんでした。'});}return;
      }
      if(path==='/api/import'&&req.method==='POST'){
        try{send(200,{report:await importBackup(JSON.parse(body?.toString('utf8')||''))});}catch(e){send(400,{error:e instanceof Error?e.message:'バックアップを読み込めません。'});}return;
      }
      if(path==='/api/shutdown'&&req.method==='POST'){send(200,{stopped:true});setTimeout(()=>shutdown(),150);return;}
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
      const request=new Request(url,{method:req.method,headers,body:body as any});
      const handler=req.method==='GET'?GET:req.method==='POST'?POST:req.method==='PUT'?PUT:req.method==='DELETE'?DELETE:null;
      if(!handler){send(405,{error:'対応していない操作です。'});return;}
      snapshot();const response=await handler(request);res.statusCode=response.status;
      response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){send(405,{error:'対応していない操作です。'});return;}
    let target=resolve(publicRoot,'.'+path);
    if(target!==publicRoot&&!target.startsWith(resolve(publicRoot)+sep)){send(404,{error:'見つかりません。'});return;}
    if(path==='/')target=join(publicRoot,'index.html');
    if(!existsSync(target)||!statSync(target).isFile()){send(404,{error:'見つかりません。'});return;}
    const bytes=readFileSync(target);res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){console.error(e instanceof Error?e.message:'Request failed');if(!res.headersSent)send(500,{error:'PCへの保存・読み込みに失敗しました。空き容量をご確認ください。'});else res.end();}finally{if(countedMutation)activeMutations--;}
});
function shutdown(){server.close(()=>{sqlite.close();process.exit(0);});server.closeIdleConnections();setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
server.on('error',e=>{console.error('自分図書館を起動できませんでした:',e.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>{console.log('YOHAKU_READY '+origin);if(!updating)finishRuntimeUpdate();organizeLaunchers(appRoot).catch(()=>{/* File layout must never prevent reading. */});});

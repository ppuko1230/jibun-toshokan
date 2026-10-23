import {readFileSync,existsSync,lstatSync,copyFileSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function runtimeRequirement(app){
  const value=JSON.parse(readFileSync(join(app,'release.json'),'utf8')).runtime;
  if(value===undefined)return null;
  if(!value||!/^v\d+\.\d+\.\d+$/.test(value.version)||!/^[a-f0-9]{64}$/.test(value.sha256)||!/^[a-f0-9]{64}$/.test(value.licenseSha256))throw Error('Node.jsの更新情報を確認できません。');
  return value;
}
function checkedFile(app,relative,sha256){
  const file=join(app,relative);
  if(!existsSync(file))return null;
  for(let path=file;path!==resolve(app);path=dirname(path)){
    if(lstatSync(path).isSymbolicLink())throw Error('Node.jsの保存先にリンクを使用できません。');
  }
  if(!lstatSync(file).isFile()||digest(file)!==sha256)return null;
  return file;
}
export function runtimeExecutable(app){
  const required=runtimeRequirement(app);
  if(!required)return join(app,'runtime/node.exe');
  const file=checkedFile(app,'runtime/node.exe',required.sha256)||checkedFile(app,'public/runtime/node.exe',required.sha256);
  if(!file)throw Error('Node.jsの更新ファイルを確認できません。配布ZIPをすべて展開してください。');
  return file;
}
// This runs before the bundled server initializes SQLite, even when a legacy
// updater starts it with the old runtime. The replacement child owns the port.
export function ensureRuntime(app=fileURLToPath(new URL('../../',import.meta.url))){
  app=resolve(app);const required=runtimeRequirement(app);
  if(!required)return;
  if(process.version===required.version&&digest(process.execPath)===required.sha256)return;
  const executable=runtimeExecutable(app);
  if(resolve(executable).toLowerCase()===resolve(process.execPath).toLowerCase())throw Error('Node.jsの版番号を確認できません。');
  const child=spawn(executable,[...process.execArgv,...process.argv.slice(1)],{cwd:process.cwd(),env:process.env,windowsHide:true,detached:true,stdio:'inherit'});
  child.once('error',error=>{console.error(error.message);process.exit(1);});
  child.once('spawn',()=>{child.unref();process.exit(0);});
  return new Promise(()=>{});
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// The old updater can still hold runtime/node.exe open. Keep serving with the
// signed payload until it exits, then atomically promote only the runtime files.
export async function promoteRuntime(app){
  const required=runtimeRequirement(app);if(!required)return true;
  if(checkedFile(app,'runtime/node.exe',required.sha256))return true;
  const source=checkedFile(app,'public/runtime/node.exe',required.sha256);
  const license=checkedFile(app,'public/runtime/NODE-LICENSE.txt',required.licenseSha256);
  if(!source||!license)throw Error('署名付きのNode.js更新ファイルが見つかりません。');
  mkdirSync(join(app,'runtime'),{recursive:true});
  const target=join(app,'runtime/node.exe'),temporary=target+'.'+randomUUID()+'.tmp';
  copyFileSync(source,temporary);
  try{
    if(digest(temporary)!==required.sha256)throw Error('Node.js更新ファイルの内容が一致しません。');
    let replaced=false;
    for(let attempt=0;attempt<120;attempt++){
      try{
        if(existsSync(target)&&lstatSync(target).isSymbolicLink())throw Error('Node.jsの保存先を確認してください。');
        renameSync(temporary,target);
        replaced=true;break;
      }catch(error){if(!['EACCES','EPERM','EBUSY'].includes(error.code))throw error;await sleep(250);}
    }
    if(!replaced)return false; // The verified payload stays usable on the next launch too.
    for(const name of ['NODE-LICENSE.txt','LICENSE.txt']){
      if(name==='LICENSE.txt'&&!existsSync(join(app,'runtime',name)))continue;
      const path=join(app,'runtime',name),scratch=path+'.'+randomUUID()+'.tmp';
      if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Node.jsライセンスの保存先を確認してください。');
      copyFileSync(license,scratch);renameSync(scratch,path);
    }
    return true;
  }finally{if(existsSync(temporary))unlinkSync(temporary);}
}

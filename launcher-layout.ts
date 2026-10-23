import {copyFileSync,existsSync,readFileSync,renameSync,unlinkSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {spawn} from 'node:child_process';
const marker=Buffer.from('JibunToshokanLauncher');
// Keep old launch scripts and installation paths intact for existing shortcuts
// and older signed updaters. Only their Explorer visibility changes.
export async function organizeLaunchers(app:string){
  const source=join(app,'public/launcher.exe');if(!existsSync(source))return;
  const bytes=readFileSync(source);if(bytes.toString('ascii',0,2)!=='MZ'||!bytes.includes(marker))return;
  const wrapped=basename(app)==='アプリ本体'&&existsSync(join(dirname(app),'自分図書館.exe'));
  const target=join(wrapped?dirname(app):app,'自分図書館.exe');
  if(existsSync(target)){
    const previous=readFileSync(target);if(!previous.includes(marker))return;
    if(!previous.equals(bytes)){const temp=target+'.new';try{copyFileSync(source,temp);renameSync(temp,target);}finally{if(existsSync(temp))unlinkSync(temp);}}
  }else copyFileSync(source,target);
  if(process.platform!=='win32')return;
  const names=['余白を開く.cmd','余白を終了.cmd','余白を更新.cmd','自分図書館を開く.cmd','自分図書館を終了.cmd','自分図書館を更新.cmd','以前の本棚を更新.cmd','デスクトップに追加.cmd','Start-Yohaku.ps1','Stop-Yohaku.ps1','Update-Yohaku.ps1','Create-Shortcut.ps1'];
  if(!wrapped)names.push('server.mjs','release.json','edition.json','installation.json','.update-state.json','THIRD-PARTY-NOTICES.txt','public','runtime','updates');
  const script='$paths=ConvertFrom-Json $env:YOHAKU_HIDE_LAUNCHERS; foreach($entry in $paths){if(Test-Path -LiteralPath $entry){$item=Get-Item -LiteralPath $entry -Force; if(-not ($item.Attributes -band [IO.FileAttributes]::Hidden)){$item.Attributes=$item.Attributes -bor [IO.FileAttributes]::Hidden}}}';
  await new Promise<void>((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'ignore',env:{...process.env,YOHAKU_HIDE_LAUNCHERS:JSON.stringify(names.map(n=>join(app,n)))}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('起動ファイルを整理できませんでした。')));});
}

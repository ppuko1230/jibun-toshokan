import {inflateRawSync} from 'node:zlib';
import {createHash,verify} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function managedPath(name){
  return typeof name==='string'&&name.length<240&&!name.includes('\\')&&!name.includes(':')&&!name.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))&&
    (['server.mjs','release.json','edition.json','THIRD-PARTY-NOTICES.txt','Start-Yohaku.ps1','Stop-Yohaku.ps1','Update-Yohaku.ps1','Create-Shortcut.ps1','余白を開く.cmd','余白を終了.cmd','余白を更新.cmd','デスクトップに追加.cmd','使い方.txt'].includes(name)||/^public\/[a-zA-Z0-9_./-]+$/.test(name)||['updates/manager.mjs','updates/package.mjs','updates/public-key.pem'].includes(name));
}
export function versionParts(v){if(typeof v!=='string'||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v))throw Error('版番号が正しくありません。');return v.split('.').map(Number);}
export function newer(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
// Only the ZIP subset produced by our release packager is accepted. Never extract
// arbitrary paths or execute an updater supplied by an unverified archive.
function unzip(bytes){
  if(bytes.length>200*1024*1024)throw Error('更新ZIPは200MB以内にしてください。');
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==bytes.readUInt16LE(end+10))throw Error('対応していないZIP形式です。');
  const count=bytes.readUInt16LE(end+10),central=bytes.readUInt32LE(end+16),centralSize=bytes.readUInt32LE(end+12);
  if(!count||count>3000||central+centralSize!==end)throw Error('更新ZIPの構造が正しくありません。');
  const entries=new Map(),names=new Set();let at=central,total=0;
  for(let i=0;i<count;i++){
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)throw Error('更新ZIPが破損しています。');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),packed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42),attributes=bytes.readUInt32LE(at+38);
    const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');at+=46+nameLength+extra+comment;
    if(at>end||flags&~0x800||![0,8].includes(method)||size>100*1024*1024||(total+=size)>400*1024*1024||((attributes>>>16)&0xf000)===0xa000||names.has(name.toLowerCase())||(!managedPath(name)&&!['manifest.json','manifest.sig'].includes(name)))throw Error('更新ZIPに許可されていないファイルがあります。');
    names.add(name.toLowerCase());
    if(offset+30>central||bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method)throw Error('更新ZIPのファイル情報が一致しません。');
    const localNameLength=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),start=offset+30+localNameLength+localExtra;
    if(start+packed>central||bytes.subarray(offset+30,offset+30+localNameLength).toString('utf8')!==name)throw Error('更新ZIPの配置が正しくありません。');
    const payload=bytes.subarray(start,start+packed),content=method===0?Buffer.from(payload):inflateRawSync(payload,{maxOutputLength:Math.max(1,size)});
    if(content.length!==size)throw Error('更新ZIPのファイルサイズが一致しません。');
    entries.set(name,content);
  }
  if(at!==end)throw Error('更新ZIPの末尾が正しくありません。');return entries;
}
export function verifyPackage(file,publicKey,edition,currentVersion){
  if(statSync(file).size>200*1024*1024)throw Error('更新ZIPは200MB以内にしてください。');
  const entries=unzip(readFileSync(file)),raw=entries.get('manifest.json'),signature=entries.get('manifest.sig');
  if(!raw||!signature||!verify(null,raw,publicKey,Buffer.from(signature.toString('ascii').trim(),'base64')))throw Error('自分図書館の正規の更新ZIPであることを確認できません。');
  const manifest=JSON.parse(raw.toString('utf8'));
  versionParts(manifest.version);
  if(manifest.format!=='yohaku-update-v1'||manifest.edition!==edition||manifest.dataSchema!==1||manifest.managerProtocol!==1||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('この本棚に適用できない更新です。個人版・配布版を確認してください。');
  if(currentVersion&&!newer(manifest.version,currentVersion))throw Error('同じ版、または古い版の更新ZIPです。');
  const seen=new Set();
  for(const f of manifest.files){
    if(!managedPath(f.path)||seen.has(f.path)||!Number.isInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('更新の一覧が正しくありません。');
    seen.add(f.path);const bytes=entries.get(f.path);if(!bytes||bytes.length!==f.bytes||digest(bytes)!==f.sha256)throw Error('更新ZIPの内容が変更されているか、破損しています。');
  }
  for(const name of ['server.mjs','release.json','Start-Yohaku.ps1','Stop-Yohaku.ps1','Update-Yohaku.ps1','public/index.html','public/assets/app.js','public/assets/app.css','updates/manager.mjs','updates/package.mjs','updates/public-key.pem'])if(!seen.has(name))throw Error('更新に必要なファイルがありません。');
  if(entries.size!==seen.size+2)throw Error('更新ZIPに余分なファイルがあります。');
  const release=JSON.parse(entries.get('release.json').toString('utf8'));
  if(release.version!==manifest.version||release.edition!==edition||release.dataSchema!==1)throw Error('更新の版情報が一致しません。');
  if(release.runtime!==undefined){
    const r=release.runtime;
    if(!r||!/^v\d+\.\d+\.\d+$/.test(r.version)||!/^[a-f0-9]{64}$/.test(r.sha256)||!/^[a-f0-9]{64}$/.test(r.licenseSha256))throw Error('Node.jsの更新情報が正しくありません。');
    for(const [path,sha] of [['public/runtime/node.exe',r.sha256],['public/runtime/NODE-LICENSE.txt',r.licenseSha256]])if(!seen.has(path)||digest(entries.get(path))!==sha)throw Error('署名付きNode.js更新ファイルの内容が一致しません。');
  }
  return {manifest,entries};
}

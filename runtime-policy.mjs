import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';

// Update these pins together from one verified official Windows x64 archive.
export const runtimePolicy=Object.freeze({
  version:'v22.23.4',
  sha256:'dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f',
  licenseSha256:'8cc9bb466b19fc7e7cc99d03e9df1132021fda8b01eea2624c58bb372dbef576',
  archiveSha256:'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20',
  source:'https://nodejs.org/dist/v22.23.4/node-v22.23.4-win-x64.zip',
});
export const fileDigest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function comparable(path){return resolve(path).toLowerCase();}
function overlaps(a,b){const rel=relative(comparable(a),comparable(b));return !rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));}
function physicalPath(path){
  const absolute=resolve(path);
  if(existsSync(absolute))return realpathSync(absolute);
  const parent=resolve(absolute,'..');
  if(parent===absolute)return absolute;
  return join(physicalPath(parent),relative(parent,absolute));
}
export function assertBuildOutput(output,protectedPaths=[]){
  if(!output)throw Error('Builds require an explicit isolated YOHAKU_BUILD_DIR.');
  const out=physicalPath(output);
  for(const protectedPath of protectedPaths.filter(Boolean)){
    const guarded=physicalPath(protectedPath);
    if(overlaps(guarded,out)||overlaps(out,guarded))throw Error('Do not build into or around an installed app. Use an isolated build directory.');
  }
  if(['installation.json','data','launcher-target.json','.update-state.json'].some(name=>existsSync(join(out,name))))throw Error('Build output contains installation or library state. Use a clean isolated directory.');
  const previous=join(out,'runtime/node.exe');
  if(existsSync(previous)&&fileDigest(previous)!==runtimePolicy.sha256)throw Error('Build output contains a different runtime. Use a clean isolated directory.');
  for(const name of ['LICENSE.txt','NODE-LICENSE.txt']){
    const previousLicense=join(out,'runtime',name);
    if(existsSync(previousLicense)&&fileDigest(previousLicense)!==runtimePolicy.licenseSha256)throw Error('Build output contains a different Node license. Use a clean isolated directory.');
  }
  return out;
}
export function verifyRuntime(runtime,license){
  const binary=resolve(runtime),licensePath=resolve(license);
  if(!lstatSync(binary).isFile()||lstatSync(binary).isSymbolicLink())throw Error('Runtime must be a regular official binary.');
  if(fileDigest(binary)!==runtimePolicy.sha256)throw Error('Bundled Node SHA256 does not match the pinned official release.');
  if(fileDigest(licensePath)!==runtimePolicy.licenseSha256)throw Error('Node license does not match the pinned official archive.');
  const powershell=join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const command="$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $signature=Get-AuthenticodeSignature -LiteralPath $env:YOHAKU_VERIFY_RUNTIME; [Console]::Write((@{status=$signature.Status.ToString();signer=$signature.SignerCertificate.Subject}|ConvertTo-Json -Compress))";
  const signature=JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,env:{...process.env,YOHAKU_VERIFY_RUNTIME:binary}}));
  if(signature.status!=='Valid'||!/^CN=OpenJS Foundation(?:,|$)/.test(signature.signer||''))throw Error('Official OpenJS Authenticode signature is not valid.');
  const version=execFileSync(binary,['--version'],{encoding:'utf8',windowsHide:true}).trim();
  if(version!==runtimePolicy.version)throw Error('Bundled Node version does not match the pinned release.');
  return {binary,licensePath,version,sha256:runtimePolicy.sha256,licenseSha256:runtimePolicy.licenseSha256,signature};
}
export function stageRuntime(verified,out){
  const target=join(out,'runtime');mkdirSync(target,{recursive:true});
  if(comparable(verified.binary)!==comparable(join(target,'node.exe')))copyFileSync(verified.binary,join(target,'node.exe'));
  if(fileDigest(join(target,'node.exe'))!==runtimePolicy.sha256)throw Error('Staged Node SHA256 mismatch.');
  if(comparable(verified.licensePath)!==comparable(join(target,'NODE-LICENSE.txt')))copyFileSync(verified.licensePath,join(target,'NODE-LICENSE.txt'));
  if(fileDigest(join(target,'NODE-LICENSE.txt'))!==runtimePolicy.licenseSha256)throw Error('Staged Node license mismatch.');
}

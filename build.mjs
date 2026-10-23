import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {assertBuildOutput,verifyRuntime,stageRuntime} from './runtime-policy.mjs';
import {copyBuildAsset} from './build-copy.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const configPath=resolve(root,'../dev-paths.local.json');
const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{};
const shared=process.env.YOHAKU_EDITION==='shared';
const designReview=process.env.YOHAKU_DESIGN_REVIEW==='1';
// The approved book design ships in both editions; review identity stays separate.
const bookDesign=true;
const releaseSource=JSON.parse(readFileSync(join(root,'release.json'),'utf8'));
const appVersion=process.env.YOHAKU_VERSION||releaseSource.version;
if(!/^\d+\.\d+\.\d+$/.test(appVersion))throw new Error('Invalid release version');
const out=assertBuildOutput(process.env.YOHAKU_BUILD_DIR,[config.production,resolve(root,'../outputs/余白PC版'),root]);
if(designReview&&!process.env.YOHAKU_BUILD_DIR)throw new Error('Design reviews require an explicit isolated YOHAKU_BUILD_DIR.');
if(!designReview&&existsSync(join(out,'design-review.json')))throw new Error('Do not build a normal release over a design review. Use a clean output directory.');
if(shared&&existsSync(out)&&readdirSync(out).length)throw new Error('Shared editions require a new empty build directory. Never reuse a personal app folder.');
const runtime=verifyRuntime(process.env.YOHAKU_RUNTIME||process.execPath,process.env.YOHAKU_NODE_LICENSE||join(root,'distribution/NODE-LICENSE.txt'));
const dependencies=resolve(process.env.YOHAKU_DEPENDENCIES||config.dependencies||resolve(root,'../node_modules'));
const {build}=await import(pathToFileURL(join(dependencies,'esbuild/lib/main.js')).href);
mkdirSync(join(out,'public','assets'),{recursive:true});
if(shared){for(const name of ['vendor','favicon.svg','yohaku-book.ico'])copyBuildAsset(join(root,'public',name),join(out,'public',name),{recursive:true});}
else copyBuildAsset(join(root,'public'),join(out,'public'),{recursive:true});
const define={'process.env.NODE_ENV':'"production"','__YOHAKU_SHARED__':String(shared),'__YOHAKU_VERSION__':JSON.stringify(appVersion),'__YOHAKU_DESIGN_REVIEW__':String(designReview),'__YOHAKU_BOOK_DESIGN__':String(bookDesign)};
const designPlugin={name:'book-design-assets',setup(builder){builder.onResolve({filter:/^\/design-kit\//},args=>({path:args.path,external:true}));}};
await build({absWorkingDir:root,entryPoints:['main.tsx'],bundle:true,format:'esm',platform:'browser',target:['chrome110','edge110'],minify:true,sourcemap:false,nodePaths:[dependencies],outfile:join(out,'public/assets/app.js'),define,plugins:[designPlugin],legalComments:'eof'});
const html=readFileSync(join(root,'index.html'),'utf8').replace('/main.tsx','/assets/app.js').replace('</head>','<link rel="stylesheet" href="/assets/app.css"></head>');
writeFileSync(join(out,'public/index.html'),html);
const emptyData={'samples.json':[],'web-vol1.json':{pages:{}},'web-outlines.json':{},'web-samples.json':{'ue5-range':{pages:{}}},'range-code-source.json':{files:{}},'web-range-v2.json':{pages:{},chapters:[],files:[]},'web-vol1-v2.json':{pages:{},chapters:[],files:[]},'code-practice.json':[]};
const stripTextbooks={name:'empty-bookshelf',setup(builder){builder.onLoad({filter:/[\\/]app[\\/]data[\\/].*\.json$/},args=>{const name=basename(args.path);if(!(name in emptyData))throw new Error('Unreviewed textbook asset: '+name);return {contents:JSON.stringify(emptyData[name]),loader:'json'};});}};
mkdirSync(join(out,'public/runtime'),{recursive:true});
await build({absWorkingDir:root,entryPoints:['runtime-bootstrap.mjs'],bundle:true,format:'esm',platform:'node',target:'node22',outfile:join(out,'public/runtime/bootstrap.mjs'),legalComments:'none'});
writeFileSync(join(out,'public/runtime/resolve.ps1'),'\ufeff'+readFileSync(join(root,'distribution/runtime-resolve.ps1'),'utf8').replace(/^\ufeff+/,''));
await build({absWorkingDir:root,entryPoints:['server.ts'],bundle:true,format:'esm',platform:'node',target:'node22',outfile:join(out,'server.mjs'),nodePaths:[dependencies],define,plugins:shared?[stripTextbooks]:[],legalComments:'eof',banner:{js:"import {ensureRuntime as ensureBundledRuntime} from './public/runtime/bootstrap.mjs'; await ensureBundledRuntime();"}});
stageRuntime(runtime,out);
const runtimeVersion=runtime.version;
const licenses=['react','react-dom','scheduler','lucide-react'];
let licenseText='Jibun Toshokan - third-party licenses\n\n';
for(const pkg of licenses){const p=JSON.parse(readFileSync(join(dependencies,pkg,'package.json'),'utf8'));licenseText+=pkg+' '+p.version+'\n'+readFileSync(join(dependencies,pkg,'LICENSE'),'utf8')+'\n\n';}
if(bookDesign){
  const kit=join(root,'materials/design-kit'),dest=join(out,'public/design-kit');
  mkdirSync(dest,{recursive:true});
  for(const dir of ['fonts','illustrations','licenses'])copyBuildAsset(join(kit,dir),join(dest,dir),{recursive:true});
  copyBuildAsset(join(kit,'sources.json'),join(dest,'sources.json'));
  for(const name of readdirSync(join(kit,'licenses')))licenseText+=name+'\n'+readFileSync(join(kit,'licenses',name),'utf8')+'\n\n';
}
// Preserve the original licenses and offer one readable copy from settings.
const vendor=join(root,'public/vendor/pdfjs');
licenseText+='PDF.js 5.6.205 - https://github.com/mozilla/pdf.js\n'+readFileSync(join(vendor,'LICENSE'),'utf8')+'\n\n';
for(const dir of ['cmaps','standard_fonts','wasm'])for(const name of readdirSync(join(vendor,dir)).filter(name=>name.startsWith('LICENSE')))licenseText+='PDF.js '+dir+'/'+name+'\n'+readFileSync(join(vendor,dir,name),'utf8')+'\n\n';
const nodeLicense=runtime.licensePath;
licenseText+='Node.js '+runtimeVersion+' (including bundled dependencies) - https://nodejs.org/\n'+readFileSync(nodeLicense,'utf8')+'\n\n';
licenseText+='Design asset provenance: public/design-kit/sources.json\nThe paper sound is synthesized locally; no third-party audio recording is included.\n';
if(designReview)writeFileSync(join(out,'design-review.json'),JSON.stringify({designReview:true,distributionReady:false}));
writeFileSync(join(out,'THIRD-PARTY-NOTICES.txt'),licenseText);
writeFileSync(join(out,'public/licenses.txt'),licenseText);
for(const name of ['Start-Yohaku.ps1','Stop-Yohaku.ps1','Update-Yohaku.ps1'])writeFileSync(join(out,name),'\ufeff'+readFileSync(join(root,name),'utf8').replace(/^\ufeff/,'').replaceAll('余白','自分図書館'));
writeFileSync(join(out,'Create-Shortcut.ps1'),'\ufeff'+readFileSync(join(root,'distribution/Create-Shortcut.ps1'),'utf8').replace(/^\ufeff+/,'').replaceAll('余白','自分図書館').replaceAll('自分図書館 - 自分の教材本棚','自分図書館'));
writeFileSync(join(out,'public/launcher-setup.ps1'),'\ufeff'+readFileSync(join(root,'distribution/launcher-setup.ps1'),'utf8').replace(/^\ufeff+/,''));
const compiler=join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
if(!existsSync(compiler))throw Error('Windows .NET Framework C# compiler is required to build the launcher.');
const assembly=join(out,'launcher-version.cs');
writeFileSync(assembly,'using System.Reflection;\n[assembly: AssemblyTitle("自分図書館")]\n[assembly: AssemblyVersion("'+appVersion+'.0")]\n[assembly: AssemblyFileVersion("'+appVersion+'.0")]\n');
execFileSync(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll','/win32icon:'+join(root,'public/yohaku-book.ico'),'/out:'+join(out,'public/launcher.exe'),join(root,'distribution/Launcher.cs'),assembly],{windowsHide:true,stdio:'pipe'});
mkdirSync(join(out,'updates'),{recursive:true});
for(const name of ['manager.mjs','package.mjs','public-key.pem'])copyBuildAsset(join(root,'updates',name),join(out,'updates',name));
writeFileSync(join(out,'release.json'),JSON.stringify({...releaseSource,version:appVersion,edition:shared?'shared':'personal',runtime:{version:runtime.version,sha256:runtime.sha256,licenseSha256:runtime.licenseSha256}}));
writeFileSync(join(out,'edition.json'),JSON.stringify({edition:shared?'shared':'personal',port:shared?43147:43127,version:appVersion}));
writeFileSync(join(out,'余白を開く.cmd'),Buffer.from('@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-Yohaku.ps1"\r\n','ascii'));
writeFileSync(join(out,'余白を終了.cmd'),Buffer.from('@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Stop-Yohaku.ps1"\r\n','ascii'));
writeFileSync(join(out,'余白を更新.cmd'),Buffer.from('@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-Yohaku.ps1"\r\n','ascii'));
// Keep the old command names for existing updater compatibility.
for(const action of ['開く','終了','更新'])copyBuildAsset(join(out,'余白を'+action+'.cmd'),join(out,'自分図書館を'+action+'.cmd'));
if(!shared)writeFileSync(join(out,'使い方.txt'),readFileSync(join(root,'distribution/個人版の使い方.txt'),'utf8').replace('{{APP_VERSION}}',appVersion));
if(shared){
  writeFileSync(join(out,'デスクトップに追加.cmd'),Buffer.from('@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Create-Shortcut.ps1"\r\n','ascii'));
  writeFileSync(join(out,'使い方.txt'),readFileSync(join(root,'distribution','使い方.txt'),'utf8').replace('{{APP_VERSION}}',appVersion));
}
console.log('Built: '+out);

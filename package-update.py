"""Create a signed update; stage Node under public/ for legacy verifier compatibility."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import json, subprocess, sys

root = Path(__file__).resolve().parent.parent
source, target = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
assert not (source/'design-review.json').exists(), 'Design reviews are not app updates. Review and promote the design first.'
key = Path(sys.argv[3]).resolve() if len(sys.argv)>3 else root/'work/update-tools/signing-key.pem'
release = json.loads((source/'release.json').read_text(encoding='utf-8'))
assert release['edition'] in ['personal','shared'] and release['dataSchema']==1
names=['server.mjs','release.json','edition.json','THIRD-PARTY-NOTICES.txt','Start-Yohaku.ps1','Stop-Yohaku.ps1','Update-Yohaku.ps1','余白を開く.cmd','余白を終了.cmd','余白を更新.cmd']
names += [n for n in ['Create-Shortcut.ps1','デスクトップに追加.cmd','使い方.txt'] if (source/n).exists()]
paths=[source/n for n in names]
paths += [p for p in (source/'public').rglob('*') if p.is_file()]
paths += [source/'updates'/n for n in ['manager.mjs','package.mjs','public-key.pem']]
sources={p.relative_to(source).as_posix():p for p in paths}
if 'runtime' in release:
    sources.update({'public/runtime/node.exe':source/'runtime/node.exe','public/runtime/NODE-LICENSE.txt':source/'runtime/NODE-LICENSE.txt'})
    assert sha256((source/'runtime/node.exe').read_bytes()).hexdigest()==release['runtime']['sha256']
    assert sha256((source/'runtime/NODE-LICENSE.txt').read_bytes()).hexdigest()==release['runtime']['licenseSha256']
files=[]
for rel,p in sorted(sources.items()):
    assert not p.is_symlink() and not {'data','backups','node_modules','.git'}.intersection(p.relative_to(source).parts)
    assert p.suffix not in ['.sqlite','.db','.map']
    if release['edition']=='shared': assert 'samples' not in p.relative_to(source).parts and p.suffix!='.pdf'
    files.append({'path':rel,'bytes':p.stat().st_size,'sha256':sha256(p.read_bytes()).hexdigest()})
manifest={'format':'yohaku-update-v1','version':release['version'],'edition':release['edition'],'dataSchema':1,'managerProtocol':1,'files':files}
raw=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode('utf-8')
scratch=root/'work/update-tools';scratch.mkdir(parents=True,exist_ok=True)
manifest_file=scratch/('manifest-'+release['edition']+'-'+release['version']+'.json');manifest_file.write_bytes(raw)
sign_script="import {readFileSync} from 'node:fs';import {sign} from 'node:crypto';process.stdout.write(sign(null,readFileSync(process.argv[2]),readFileSync(process.argv[1])).toString('base64'));"
signature=subprocess.check_output([str(source/'runtime/node.exe'),'--input-type=module','-e',sign_script,str(key),str(manifest_file)])
target.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as archive:
    archive.writestr('manifest.json',raw);archive.writestr('manifest.sig',signature)
    for item in files: archive.write(sources[item['path']],item['path'])
print(json.dumps({'file':str(target),'edition':release['edition'],'version':release['version'],'files':len(files),'bytes':target.stat().st_size},ensure_ascii=False))

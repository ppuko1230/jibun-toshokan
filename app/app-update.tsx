import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,LoaderCircle} from 'lucide-react';
import {appName} from './lib/edition';
import type {UpdateRelease} from './lib/update-release';
async function request(path:string,body?:unknown){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(body===undefined?5000:150000)});const value=await response.json();if(!response.ok)throw Error(value.error||'更新を確認できませんでした。');return value;}
export default function AppUpdate({version,dirty,busy,parentBusy,startupEnabled,startupBusy,setStartupEnabled,initialRelease,reveal}:{version:string;dirty:boolean;busy:boolean;parentBusy:(value:boolean)=>void;startupEnabled:boolean;startupBusy:boolean;setStartupEnabled:(value:boolean)=>Promise<boolean>;initialRelease:UpdateRelease|null;reveal:boolean}){
  const [release,setRelease]=useState<UpdateRelease|null>(initialRelease),[message,setMessage]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[saved,setSaved]=useState(false),[expanded,setExpanded]=useState(reveal);
  const section=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(initialRelease){setRelease(initialRelease);setSaved(false);setMessage(initialRelease.available?appName+' '+initialRelease.version+'の更新があります。':'最新の版です。');}},[initialRelease]);
  useEffect(()=>{if(reveal){setExpanded(true);const frame=requestAnimationFrame(()=>section.current?.scrollIntoView({block:'nearest'}));return()=>cancelAnimationFrame(frame);}},[reveal]);
  const alive=useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
  async function check(){setWorking(true);parentBusy(true);setError('');setMessage('更新を確認しています…');try{const result=await request('app-update/check',{});setRelease(result);setSaved(false);setMessage(result.available?appName+' '+result.version+'へ更新できます。':'最新の版です。');}catch(e){setMessage('');setError((e as Error).message);}finally{setWorking(false);parentBusy(false);}}
  async function install(){
    if(dirty||!saved||!release?.available)return;
    setWorking(true);parentBusy(true);setError('');setMessage('更新をダウンロードしています…');
    try{
      const download=await request('app-update/download',{});setMessage('教材とメモを残して更新しています…');
      const job=await request('app-update/install',{token:download.token});
      // Server downtime is expected during a verified, reversible app-only update.
      for(let i=0;i<180&&alive.current;i++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        let status:any;try{status=await request('app-update/status');}catch{continue;}
        if(status.report?.id!==job.id)continue;
        if(status.report.phase==='error')throw Error(status.report.error||'更新できませんでした。旧版で引き続き使えます。');
        if(status.report.phase==='complete'){
          const local=await request('local-status');if(local.appVersion!==job.version)throw Error('更新後の版番号を確認できませんでした。');
          setMessage('更新しました。画面を開き直します…');location.reload();return;
        }
      }
      throw Error('更新結果をまだ確認できません。デスクトップのショートカットから開き直してください。');
    }catch(e){if(alive.current){setMessage('');setError((e as Error).message);}}
    finally{if(alive.current){setWorking(false);parentBusy(false);}}
  }
  return <details ref={section} className="backup-section" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>アプリの更新 <span className="muted">{version}</span></summary>
    <label className="startup-update-preference"><input type="checkbox" checked={startupEnabled} disabled={busy||working||startupBusy} onChange={e=>setStartupEnabled(e.target.checked)}/>起動時に更新を確認する</label>
    <p className="backup-small">起動時の確認がオンの場合、GitHubの更新情報だけを確認します。教材やメモは送信せず、ネットにつながらなくても通常どおり使えます。</p>
    {__YOHAKU_SHARED__?<>
      <p>新しい版があるときにお知らせします。ダウンロードと適用は、ご自分で進められます。料金・ログインは不要です。</p>
      <button className="button" disabled={busy||working} onClick={check}>{working?<LoaderCircle size={17} className="spin"/>:<RefreshCw size={17}/>}更新を確認</button>
      {release?.available&&<div className="app-update-confirm"><p>更新前に、開いているすべての本棚の編集を保存してください。</p><label><input type="checkbox" checked={saved} disabled={working} onChange={e=>setSaved(e.target.checked)}/> ほかの画面の編集も保存しました</label>{dirty&&<p className="notice">この画面の補足が未保存です。設定を閉じて保存してください。</p>}<button className="button primary" disabled={busy||working||dirty||!saved} onClick={install}><Download size={17}/>ダウンロードして更新</button></div>}
      {message&&<p role="status" aria-live="polite">{message}</p>}{error&&<p className="notice" role="alert">{error}</p>}
      <p className="backup-small">教材・メモを残して更新し、更新後に学習データを照合します。失敗した場合はアプリを旧版へ戻します。ネット接続がないときも、通常の読書と保存は使えます。</p>
      </>:<>{message&&<p role="status">{message}</p>}<p>個人版の通知は、公開版の版番号を確認しています。教材を含むため、適用には署名付きの個人版更新が必要です。更新は開発元に依頼してください。</p></>}
    {__YOHAKU_SHARED__&&<p className="backup-small">以前の本棚を引き継ぐ場合は、新しく展開した「自分図書館.exe」を開き、「以前の本棚を使っている方はこちら」を選べます。</p>}
  </details>;
}

import {useEffect,useRef,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';
import type {UpdateRelease} from './lib/update-release';
import './startup-update.css';

export function useStartupUpdate(ready:boolean,enabled:boolean){
  const checked=useRef(false),[release,setRelease]=useState<UpdateRelease|null>(null);
  useEffect(()=>{
    if(!enabled){checked.current=false;setRelease(null);return;}
    if(!ready||checked.current)return;
    const controller=new AbortController();let deadline:ReturnType<typeof setTimeout>|undefined;
    const timer=setTimeout(()=>{
      checked.current=true;deadline=setTimeout(()=>controller.abort(),7000);
      fetch('/api/app-update/notice',{cache:'no-store',signal:controller.signal})
        .then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!controller.signal.aborted&&value.enabled&&value.release)setRelease(value.release);})
        .catch(()=>{/* Offline startup stays quiet and never blocks the bookshelf. */})
        .finally(()=>clearTimeout(deadline));
    },750);
    return()=>{clearTimeout(timer);clearTimeout(deadline);controller.abort();};
  },[ready,enabled]);
  return enabled?release:null;
}

export default function StartupUpdateNotice({release,hidden,open}:{release:UpdateRelease|null;hidden:boolean;open:()=>void}){
  const [dismissed,setDismissed]=useState('');
  if(!release?.available||dismissed===release.version)return null;
  return <aside className="startup-update-notice" hidden={hidden} role="status" aria-live="polite" aria-label="アプリの更新通知">
    <RefreshCw size={21} aria-hidden="true"/>
    <div><strong>新しいバージョンがあります</strong><p>自分図書館 {release.version}</p><button className="text-button" onClick={open}>更新を見る <span aria-hidden="true">→</span></button></div>
    <button className="icon-button" aria-label="更新通知を閉じる" title="今回は閉じる。次回起動時にまたお知らせします" onClick={()=>setDismissed(release.version)}><X size={17}/></button>
  </aside>;
}

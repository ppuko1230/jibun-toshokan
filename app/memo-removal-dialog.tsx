'use client';
import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Trash2} from 'lucide-react';

export default function MemoRemovalDialog({kind,title,description,cancel,remove}:{kind:string;title:string;description?:string;cancel:()=>void;remove:()=>Promise<void>}){
  const root=useRef<HTMLDivElement>(null),busyRef=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement;root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busyRef.current)cancel();}
      if(e.key==='Tab'){
        e.stopPropagation();
        const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
        if(!buttons.length){e.preventDefault();return;}
        if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}
      }
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus({preventScroll:true});else document.querySelector<HTMLElement>('#workspace')?.focus({preventScroll:true});};
  },[]);
  async function confirm(){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
    try{await remove();}catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}
  }
  return <div className="modal-backdrop memo-removal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busyRef.current)cancel();}}><div className="upload-dialog" ref={root} role="alertdialog" aria-modal="true" aria-labelledby="remove-memo-heading" aria-describedby="remove-memo-description" aria-busy={busy}>
    <h2 id="remove-memo-heading">{kind}を削除しますか？</h2><p className="remove-book-title">{title}</p><p id="remove-memo-description" className="muted">{description||'このメモを削除します。'} 削除した内容は元に戻せません。</p>
    {error&&<div className="notice" role="alert">{error}</div>}<div className="leave-actions"><button className="button" disabled={busy} onClick={cancel}>キャンセル</button><button className="button danger" disabled={busy} onClick={confirm}>{busy?<LoaderCircle size={17} className="spin"/>:<Trash2 size={17}/>}削除する</button></div>
  </div></div>;
}

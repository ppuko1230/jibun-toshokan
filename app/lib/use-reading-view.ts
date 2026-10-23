import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import type {ReaderView} from './reader-view';

type Options={bookId:string;page:number;zoom:number;textMode:boolean;notesOpen:boolean;expanded:boolean;pdfLayout?:'single'|'spread';webFile?:string;anchorId?:string;initial?:ReaderView;root:RefObject<HTMLDivElement|null>;remember:(view:ReaderView)=>void};

/** SQLite is authoritative. Keepalive also sends the last scroll before a tab closes. */
export function useReadingView(options:Options){
  const current=useRef(options);current.current=options;
  const anchorDone=useRef(''),restored=useRef(false),restoring=useRef(false),last=useRef<ReaderView|null>(null),sent=useRef(0),pending=useRef<ReaderView|null>(null),busy=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
  const [error,setError]=useState('');
  const flush=useCallback(function send(urgent=false){
    if(timer.current){clearTimeout(timer.current);timer.current=null;}
    const view=pending.current;
    if(!view||(!urgent&&busy.current)||view.capturedAt<=sent.current)return;
    pending.current=null;busy.current=true;
    const bookId=current.current.bookId;
    fetch('/api/study-state',{method:'PUT',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({action:'view',bookId,view})})
      .then(async response=>{if(!response.ok)throw new Error();sent.current=Math.max(sent.current,view.capturedAt);if(mounted.current)setError('');})
      .catch(()=>{if(!pending.current||pending.current.capturedAt<view.capturedAt)pending.current=view;if(mounted.current)setError('読書位置を保存できませんでした。PC版のアプリが起動しているか確認してください。');})
      .finally(()=>{busy.current=false;if(pending.current&&pending.current.capturedAt>view.capturedAt)send();});
  },[]);
  const capture=useCallback(()=>{
    if(!restored.current)return;
    const o=current.current,root=o.root.current,stage=root?.querySelector<HTMLElement>('.pdf-stage'),text=root?.querySelector<HTMLElement>('.term-text-scroll');
    if(!root||(o.textMode?text?.getAttribute('aria-busy')==='true':!stage||stage.getAttribute('aria-busy')==='true'))return;
    const codeScroll=Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>('.web-code')).filter(el=>el.scrollLeft>0).map(el=>[el.closest<HTMLElement>('[data-block-id]')?.dataset.blockId||'',el.scrollLeft]));
    const webFile=o.textMode?text?.dataset.file||undefined:o.webFile;
    const values={...(o.pdfLayout?{pdfLayout:o.pdfLayout}:{}),webFile,codeScroll,page:o.page,zoom:o.zoom,windowX:Math.max(0,window.scrollX),windowY:Math.max(0,window.scrollY),pdfX:stage?.scrollLeft||0,pdfY:stage?.scrollTop||0,textY:text?.scrollTop||0,textMode:o.textMode,notesOpen:o.notesOpen,expanded:o.expanded};
    if(last.current&&Object.entries(values).every(([key,value])=>key==='codeScroll'?JSON.stringify(last.current!.codeScroll||{})===JSON.stringify(value):last.current![key as keyof ReaderView]===value))return;
    const view={...values,capturedAt:Math.max(Date.now(),(last.current?.capturedAt||0)+1)};
    last.current=view;pending.current=view;o.remember(view);
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>flush(),250);
  },[flush]);
  const ready=useCallback(()=>{
    const requested=current.current.anchorId?current.current.page+':'+current.current.anchorId:'';
    if(restored.current&&(!requested||anchorDone.current===requested)){capture();return;}
    if(restoring.current)return;
    restoring.current=true;
    // Font metrics can change the document height after PDF/text content arrives.
    document.fonts.ready.then(()=>requestAnimationFrame(()=>{
      restoring.current=false;
      const o=current.current,v=o.initial,root=o.root.current;
      if(!mounted.current||!root)return;
      const stage=root.querySelector<HTMLElement>('.pdf-stage'),text=root.querySelector<HTMLElement>('.term-text-scroll');
      if((o.textMode?text:stage)?.getAttribute('aria-busy')==='true')return;
      if(o.anchorId){const block=Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]')).find(el=>el.dataset.blockId===o.anchorId||el.dataset.blockAliases?.split(' ').includes(o.anchorId!));block?.scrollIntoView({block:'center',behavior:'instant'});anchorDone.current=o.page+':'+o.anchorId;const url=new URL(location.href);url.searchParams.delete('block');history.replaceState(null,'',url.pathname+url.search);}else if(v?.page===o.page&&!restored.current){
        if(stage){stage.scrollLeft=v.pdfX;stage.scrollTop=v.pdfY;}
        if(text)text.scrollTop=v.textY;
        for(const code of Array.from(root.querySelectorAll<HTMLElement>('.web-code'))){const id=code.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;code.scrollLeft=id?v.codeScroll?.[id]||0:0;}
        window.scrollTo({left:v.windowX,top:v.windowY,behavior:'instant'});
      }
      restored.current=true;capture();
    }));
  },[capture]);
  useEffect(()=>{capture();},[options.page,options.zoom,options.textMode,options.notesOpen,options.expanded,options.pdfLayout,capture]);
  useEffect(()=>{
    mounted.current=true;
    const closing=()=>{capture();flush(true);},hidden=()=>{if(document.visibilityState==='hidden')closing();};
    window.addEventListener('scroll',capture,{capture:true,passive:true});window.addEventListener('pagehide',closing);window.addEventListener('beforeunload',closing);document.addEventListener('visibilitychange',hidden);
    return()=>{mounted.current=false;window.removeEventListener('scroll',capture,true);window.removeEventListener('pagehide',closing);window.removeEventListener('beforeunload',closing);document.removeEventListener('visibilitychange',hidden);flush(true);};
  },[capture,flush]);
  return {ready,error};
}

import {useEffect,useRef,useState} from 'react';
import {BookOpen} from 'lucide-react';
import type {Book} from './lib/library';
import {pdfLibrary,pdfOptions} from './lib/pdf-client';

const covers=/* @__PURE__ */new Map<string,string>();
let queue:Promise<unknown>=/* @__PURE__ */Promise.resolve();

/** Independent, serial thumbnail jobs never evict the reader's PDF document. */
export default function BookCover({book}:{book:Book}){
  const key=book.id+':'+book.hash,host=useRef<HTMLSpanElement>(null);
  const [url,setUrl]=useState(covers.get(key)||''),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(covers.has(key)){setUrl(covers.get(key)!);return;}
    let cancelled=false,started=false;
    const begin=()=>{
      if(started)return;started=true;
      const task=queue.then(async()=>{
        if(cancelled)return;
        let doc:any;
        try{
          const lib=await pdfLibrary();if(cancelled)return;
          doc=await lib.getDocument({...pdfOptions,url:book.sample?'/samples/'+encodeURIComponent(book.id)+'.pdf':'/api/books/'+encodeURIComponent(book.id)+'/pdf',disableRange:true,disableStream:true}).promise;
          if(cancelled)return;
          const page=await doc.getPage(1),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(180/base.width,248/base.height)});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
          const data=canvas.toDataURL('image/png');covers.set(key,data);
          if(covers.size>80)covers.delete(covers.keys().next().value!);
          if(!cancelled)setUrl(data);
        }catch{if(!cancelled)setFailed(true);}finally{await doc?.destroy().catch(()=>{});}
      });
      queue=task.catch(()=>{});
    };
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();begin();}},{rootMargin:'120px'});
    if(host.current)observer.observe(host.current);
    return()=>{cancelled=true;observer.disconnect();};
  },[key,book.id,book.sample]);
  return <span className="book-cover" ref={host}>{url&&!failed?<img src={url} alt={book.title+'の表紙'} onError={()=>setFailed(true)}/>:<BookOpen size={25} aria-label={failed?'表紙を表示できません':'表紙を読み込み中'}/>}</span>;
}

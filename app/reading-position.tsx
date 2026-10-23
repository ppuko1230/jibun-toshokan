import {useEffect,useRef,useState,type RefObject} from 'react';
import type {Book} from './lib/library';

/** A location cue, not a completed-reading score. Scrolling never changes note/bookmark targets. */
export default function ReadingPosition({book,page,text,root,theme,onPageChange}:{book:Book;page:number;text:boolean;root:RefObject<HTMLDivElement|null>;theme:string;onPageChange?:(page:number)=>void}){
  const [chapters,setChapters]=useState<{page:number;title:string}[]>([]);
  const [visible,setVisible]=useState({page,title:'',file:'',first:page,last:page,context:page});
  const current=useRef({page,text});current.current={page,text};
  const scheduleRef=useRef(()=>{});
  useEffect(()=>{let cancelled=false;fetch('/api/reading-map/'+encodeURIComponent(book.id),{cache:'no-store'}).then(async r=>{if(!r.ok)return;const d=await r.json();if(!cancelled)setChapters(d.chapters);}).catch(()=>{});return()=>{cancelled=true;};},[book.id]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{
      frame=0;const o=current.current,pane=root.current?.querySelector<HTMLElement>('.web-reading');
      let next={page:o.page,title:'',file:'',first:o.page,last:o.page,context:o.page};
      if(o.text&&pane&&pane.getAttribute('aria-busy')!=='true'){
        const rect=pane.getBoundingClientRect(),top=Math.max(0,rect.top),bottom=Math.min(window.innerHeight,rect.bottom);
        const probe=top+Math.min(120,Math.max(0,bottom-top)*.25);
        const ranges=Array.from(pane.querySelectorAll<HTMLElement>('.web-code-range[data-source-page],.web-file-explanation[data-source-page]')).filter(el=>el.getBoundingClientRect().height>0);
        const at=ranges.find(el=>el.getBoundingClientRect().top<=probe&&el.getBoundingClientRect().bottom>probe)||ranges.find(el=>el.getBoundingClientRect().top>probe)||ranges.at(-1);
        const sourcePage=Number(at?.dataset.sourcePage);
        next={page:Number.isInteger(sourcePage)&&sourcePage>0&&sourcePage<=book.pageCount?sourcePage:o.page,title:pane.dataset.pageTitle||'',file:pane.querySelector('.web-article.is-code-file h2')?.textContent||'',first:Number(pane.dataset.firstPage)||o.page,last:Number(pane.dataset.lastPage)||o.page,context:Number(pane.dataset.contextPage)||o.page};
      }
      setVisible(old=>Object.keys(next).every(key=>old[key as keyof typeof old]===next[key as keyof typeof next])?old:next);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    scheduleRef.current=schedule;
    const observer=new MutationObserver(schedule);if(root.current)observer.observe(root.current,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','data-page-title','data-first-page','data-last-page','open','data-context-page']});
    const resize=new ResizeObserver(schedule);if(root.current)resize.observe(root.current);
    window.addEventListener('scroll',schedule,{capture:true,passive:true});window.addEventListener('resize',schedule);schedule();
    return()=>{scheduleRef.current=()=>{};observer.disconnect();resize.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);cancelAnimationFrame(frame);};
  },[book.id,book.pageCount,root]);
  useEffect(()=>{scheduleRef.current();},[page,text]);
  useEffect(()=>{onPageChange?.(visible.page);},[visible.page,onPageChange]);
  const context=visible.file?visible.context:visible.page;
  const chapter=chapters.filter(c=>c.page<=context).at(-1);
  const percent=Math.round(visible.page/book.pageCount*100),position=(visible.page-.5)/book.pageCount*100;
  const location=chapter?.title||visible.title||'本文';
  return <aside className="reading-position" data-theme={theme} aria-label="教材の現在地">
    <div className="reading-position-heading"><div className="reading-position-identity"><strong title={book.title}>{book.title}</strong><p title={[location,visible.file].filter(Boolean).join(' ／ ')}><span>{location}</span>{visible.file&&<code>{visible.file}</code>}</p></div><div className="reading-position-page"><strong><span>表示中 </span>{visible.page}<span> / {book.pageCount}ページ</span></strong><small>{book.labels[visible.page-1]!==String(visible.page)?`紙面 ${book.labels[visible.page-1]} · `:''}本の{percent}%付近 · 残り{book.pageCount-visible.page}ページ</small></div></div>
    <div className="book-thickness" role="progressbar" aria-label="本の中の位置" aria-valuemin={1} aria-valuemax={book.pageCount} aria-valuenow={visible.page} aria-valuetext={`${book.title}、${location}、${visible.page} / ${book.pageCount}ページ。本の${percent}%付近。`}>
      <span className="book-thickness-passed" style={{width:position+'%'}}/>{chapters.filter(c=>c.page>1).map(c=><span className="book-chapter-tick" key={c.page+':'+c.title} title={c.title} style={{left:(c.page-1)/book.pageCount*100+'%'}}/>)}<span className="book-position-marker" style={{left:position+'%'}}/>
    </div>
    <div className="book-position-scale" aria-hidden="true"><span>はじめ</span><span>1/4</span><span>半分</span><span>3/4</span><span>おわり</span></div>
  </aside>;
}

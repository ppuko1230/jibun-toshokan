import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle,NotebookPen} from 'lucide-react';
import type {Book} from './lib/library';
import {pdfDocument} from './lib/pdf-client';
import {bookPageHeight,paperEdges,pdfRange,pdfWindow,type PdfLayout} from './lib/pdf-book';
import type {TermActions} from './term-ui';
import {BookPagePreview,BookPageTurn,useBookPageTurn,type PageMotion} from './book-page-turn';
import {useDevicePixelRatio} from './lib/use-device-pixel-ratio';
import {useBookPan} from './lib/use-book-pan';
import ReaderPointerHelp from './reader-pointer-help';
import PdfBookSheet,{type Sheet} from './pdf-book-sheet';

export default function PdfBook({book,page,layout,zoom,fitPage,actions,onReady,selectPage,motion,sound,turnPage,saving}:{book:Book;page:number;layout:PdfLayout;zoom:number;fitPage:boolean;actions:TermActions;onReady:()=>void;selectPage:(page:number)=>void;motion:PageMotion;sound:boolean;turnPage:(direction:-1|1)=>void;saving:boolean}){
  const density=useDevicePixelRatio();
  const stage=useRef<HTMLDivElement>(null),callback=useRef(onReady);callback.current=onReady;
  const [size,setSize]=useState({width:0,height:0,inlinePadding:24,blockPadding:48}),[data,setData]=useState<{bookId:string;sheets:Sheet[]}|null>(null),[error,setError]=useState(''),[,refresh]=useState(0);
  const complete=useRef(new Map<string,{renderKey:string;pages:Set<number>;painted:boolean}>()),position=useRef({left:0,top:0});
  const range=pdfRange(page,book.pageCount,layout),key=book.id+':'+layout+':'+range.first+':'+range.last;
  const neighbours=pdfWindow(page,book.pageCount,layout),windowKey=neighbours.map(r=>r.first+':'+r.last).join(','),allowed=new Set(neighbours.flatMap(r=>Array.from({length:r.last-r.first+1},(_,i)=>r.first+i)));
  const loaded=data?.bookId===book.id?data.sheets:[];
  const spreads=neighbours.map(r=>{
    const sheets=Array.from({length:r.last-r.first+1},(_,i)=>loaded.find(s=>s.number===r.first+i)).filter((s):s is Sheet=>!!s),edges=paperEdges(r.first,r.last,book.pageCount),spreadKey=book.id+':'+layout+':'+r.first+':'+r.last;
    const height=sheets.length?bookPageHeight(sheets.map(s=>s.ratio),size.width-size.inlinePadding-32,size.height-size.blockPadding-52,fitPage,zoom,edges.left+edges.right+16):40;
    return {...r,key:spreadKey,sheets,edges,height,renderKey:spreadKey+':'+height.toFixed(3)+':'+density,loaded:sheets.length===r.last-r.first+1};
  });
  const current=spreads.find(s=>s.key===key)!,{height,renderKey}=current,paint=complete.current.get(key);
  const busy=!error&&(!current.loaded||!paint?.painted||!size.width),refining=paint?.renderKey!==renderKey||paint.pages.size!==current.sheets.length;
  const edges=paperEdges(range.first,range.last,book.pageCount);
  useLayoutEffect(()=>{const node=stage.current;if(!node)return;const observer=new ResizeObserver(()=>{const style=getComputedStyle(node);setSize({width:node.offsetWidth,height:node.offsetHeight,inlinePadding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),blockPadding:parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)});});observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let cancelled=false;setError('');
    if(stage.current)position.current={left:stage.current.scrollLeft,top:stage.current.scrollTop};
    (async()=>{try{
      const doc=await pdfDocument(book.id,book.sample?'/samples/'+book.id+'.pdf':'/api/books/'+encodeURIComponent(book.id)+'/pdf');
      const numbers=Array.from({length:range.last-range.first+1},(_,i)=>range.first+i);
      const sheets=await Promise.all(numbers.map(async number=>{const existing=loaded.find(s=>s.number===number);if(existing)return existing;const pdf=await doc.getPage(number),viewport=pdf.getViewport({scale:1});return {number,pdf,ratio:viewport.width/viewport.height,baseHeight:viewport.height};}));
      if(!cancelled)setData(old=>({bookId:book.id,sheets:[...(old?.bookId===book.id?old.sheets.filter(s=>allowed.has(s.number)&&!numbers.includes(s.number)):[]),...sheets]}));
    }catch{if(!cancelled)setError('PDFを表示できませんでした。「元のPDFを開く」から確認してください。');}})();
    return()=>{cancelled=true;};
  },[book.id,book.sample,range.first,range.last,key]);
  // Neighbouring sheets stay mounted, including their canvases and selectable text.
  // Paint the destination first; background work pauses during page changes/zoom.
  useEffect(()=>{
    if(busy||refining)return;
    let cancelled=false;
    const timer=setTimeout(()=>{(async()=>{try{
      const doc=await pdfDocument(book.id,book.sample?'/samples/'+book.id+'.pdf':'/api/books/'+encodeURIComponent(book.id)+'/pdf');
      const missing=[...allowed].filter(number=>!loaded.some(s=>s.number===number)),sheets:Sheet[]=[];
      for(const number of missing){if(cancelled)return;const pdf=await doc.getPage(number),viewport=pdf.getViewport({scale:1});sheets.push({number,pdf,ratio:viewport.width/viewport.height,baseHeight:viewport.height});}
      if(!cancelled&&sheets.length)setData(old=>({bookId:book.id,sheets:[...(old?.bookId===book.id?old.sheets.filter(s=>allowed.has(s.number)):[]),...sheets]}));
    }catch{/* A neighbour can be retried by the normal foreground loader. */}})();},80);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[book.id,book.sample,windowKey,busy,refining]);
  useEffect(()=>{for(const savedKey of complete.current.keys())if(!spreads.some(s=>s.key===savedKey))complete.current.delete(savedKey);},[key,windowKey]);
  // Leave room beside the paper for navigation, and below it for the memo buttons.
  const bookWidth=height*current.sheets.reduce((sum,s)=>sum+s.ratio,0)+edges.left+edges.right+12+(range.first===range.last?0:12);
  const navigationInset=Math.max(6,(size.width-bookWidth)/2-4);
  const pageTurn=useBookPageTurn(stage,key,range.first,range.last,layout,renderKey,busy||refining,height,motion,sound);
  useBookPan(stage,pageTurn.finish);
  function rendered(number:number,renderedKey:string){const spread=spreads.find(s=>s.renderKey===renderedKey);if(!spread)return;let saved=complete.current.get(spread.key);if(saved?.renderKey!==renderedKey){saved={renderKey:renderedKey,pages:new Set(),painted:saved?.painted||false};complete.current.set(spread.key,saved);}saved.pages.add(number);if(saved.pages.size===spread.sheets.length)saved.painted=true;refresh(value=>value+1);}
  const restoredKey=useRef('');
  useLayoutEffect(()=>{if(busy||error)return;const node=stage.current;if(node&&restoredKey.current!==key){node.scrollLeft=position.current.left;node.scrollTop=position.current.top;restoredKey.current=key;}callback.current();},[key,renderKey,refining,busy,error]);
  return <div className="book-viewer" style={{'--book-nav-inset':navigationInset+'px'} as React.CSSProperties}>
  <div ref={stage} className="pdf-stage book-stage" data-pdf-layout={layout} data-spread-first={range.first} data-spread-last={range.last} data-page-count={book.pageCount} data-refining={refining} aria-busy={busy} onPointerDown={pageTurn.finish} tabIndex={0} aria-label={layout==='spread'?'PDFの見開き':'PDFの1ページ表示'} onScroll={e=>{if(!busy)position.current={left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};}}>
    {busy&&!pageTurn.preview&&<div className="pdf-loading" role="status"><LoaderCircle size={18} className="spin"/>ページを読み込んでいます…</div>}
    {error&&<div className="notice" role="alert">{error}</div>}
    {spreads.filter(s=>s.loaded).map(spread=>{const active=spread.key===key,{height,edges,sheets,renderKey}=spread;return <div className="book-model" key={spread.key} hidden={!active} aria-hidden={!active||undefined} style={{visibility:active&&(busy||error)?'hidden':'visible','--sheet-height':height+'px'} as React.CSSProperties}>
      <div className="book-paper-body" data-motion={motion} data-page-arrival={active&&pageTurn.turn&&(pageTurn.turn.previous.papers.length!==2||pageTurn.turn.current.papers.length!==2)?pageTurn.turn.direction:undefined} onAnimationEnd={e=>{if(e.target===e.currentTarget)pageTurn.finish();}}>
        <div className="book-board" aria-hidden="true"/>
        <PaperEdge side="left" width={edges.left} count={edges.before}/>
        {sheets.map((sheet,i)=><div className="book-page-unit" key={sheet.number}>
          {i>0&&<div className="book-gutter" aria-hidden="true"/>}
          <section className={'book-sheet '+(sheet.number===page?'is-active':'')} data-pdf-page={sheet.number} style={{width:height*sheet.ratio}} aria-label={'PDF '+sheet.number+'ページ'}>
            <PdfBookSheet sheet={sheet} book={book} height={height} density={density} actions={actions} renderKey={renderKey} enabled={!!size.width&&(active||!busy&&!refining)} done={rendered} fail={()=>{if(active)setError('PDFを表示できませんでした。「元のPDFを開く」から確認してください。');}}/>
            <div className="book-sheet-caption"><button type="button" title={'PDF '+sheet.number+'ページの補足を書く'} aria-label={'PDF '+sheet.number+'ページの補足を書く'} onClick={()=>selectPage(sheet.number)}><NotebookPen size={13}/>PDF {sheet.number}<span>{sheet.number===page?'選択中':'補足を書く'}</span></button></div>
          </section>
        </div>)}
        <PaperEdge side="right" width={edges.right} count={edges.after}/>
        <div className="book-board" aria-hidden="true"/>
        {active&&pageTurn.turn&&<BookPageTurn turn={pageTurn.turn} finish={pageTurn.finish} motion={motion}/>}
      </div>
    </div>;})}
    {pageTurn.preview&&!error&&<BookPagePreview frame={pageTurn.preview} total={book.pageCount}/>}
  </div>
  <ReaderPointerHelp/>
  <button type="button" className="book-side-nav previous" aria-label="本の左側：前のページ" title="前のページ（←）" disabled={range.first<=1||saving||busy} onClick={()=>turnPage(-1)}><ChevronLeft size={25} aria-hidden="true"/></button>
  <button type="button" className="book-side-nav next" aria-label="本の右側：次のページ" title="次のページ（→）" disabled={range.last>=book.pageCount||saving||busy} onClick={()=>turnPage(1)}><ChevronRight size={25} aria-hidden="true"/></button>
  </div>;
}

function PaperEdge({side,width,count}:{side:'left'|'right';width:number;count:number}){
  return <div className={'book-paper-edge '+side} style={{width}} aria-label={(side==='left'?'前':'後')+'に '+count+' ページ'} title={(side==='left'?'前':'後')+'に '+count+' ページ。厚みは本の中の位置の目安です。'}>{Array.from({length:Math.ceil(width/3)},(_,i)=><span key={i}/>)}</div>;
}


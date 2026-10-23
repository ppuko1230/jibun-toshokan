'use client';
import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import {LoaderCircle} from 'lucide-react';
import type {Book} from './lib/library';
import {pdfLibrary,pdfDocument} from './lib/pdf-client';
import {TermSurface,type TermActions} from './term-ui';
import {pdfCanvasResolution} from './lib/pdf-render-quality';
import {useDevicePixelRatio} from './lib/use-device-pixel-ratio';
export default function PdfPage({book,page,zoom,actions,fitPage=false,onReady}:{book:Book;page:number;zoom:number;actions:TermActions;fitPage?:boolean;onReady?:()=>void}){
  const density=useDevicePixelRatio();
  const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),textLayer=useRef<HTMLDivElement>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[width,setWidth]=useState(0),[height,setHeight]=useState(0),[revision,setRevision]=useState(0);
  const [dimensions,setDimensions]=useState({width:1,height:1,scale:1});
  const readyCallback=useRef(onReady);readyCallback.current=onReady;
  useLayoutEffect(()=>{if(!loading&&!error)readyCallback.current?.();},[loading,error,revision]);
  const renderedPage=useRef<string|null>(null),position=useRef<{left:number;top:number;x:number;y:number}|null>(null);
  useLayoutEffect(()=>{const saved=position.current,stage=container.current;if(!saved||!stage)return;position.current=null;stage.scrollLeft=saved.left;stage.scrollTop=saved.top;window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});},[dimensions]);
  useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(()=>{
    // The outer box stays stable when scrollbars appear at larger zoom levels.
    setWidth(el.offsetWidth);setHeight(el.offsetHeight);});observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{let cancelled=false,render:any,layer:any;if(!width||!height)return;
    setLoading(true);setError('');
    (async()=>{try{
      const [pdf,lib]=await Promise.all([pdfDocument(book.id,book.sample?'/samples/'+book.id+'.pdf':`/api/books/${book.id}/pdf`),pdfLibrary()]);if(cancelled)return;
      const p=await pdf.getPage(page);if(cancelled||!canvas.current||!textLayer.current)return;
      // Allow 32px of padding plus 16px for scrollbars in fullscreen;
      // normal mode retains its existing additional 32px reading margin.
      const base=p.getViewport({scale:1}),scale=(fitPage?Math.max(.05,Math.min(Math.max(1,width-48)/base.width,Math.max(1,height-48)/base.height)):Math.max(.2,(width-64)/base.width))*zoom,viewport=p.getViewport({scale}),output=pdfCanvasResolution(viewport.width,viewport.height,density),el=canvas.current;
      // Keep the current view when the next page changes its physical dimensions.
      const key=book.id+':'+page,stage=container.current;
      if(stage&&renderedPage.current&&renderedPage.current!==key)position.current={left:stage.scrollLeft,top:stage.scrollTop,x:window.scrollX,y:window.scrollY};
      renderedPage.current=key;
      setDimensions({width:viewport.width,height:viewport.height,scale:viewport.scale*(viewport.userUnit||1)});
      el.width=output.width;el.height=output.height;el.style.width=viewport.width+'px';el.style.height=viewport.height+'px';
      const content=await p.getTextContent();if(cancelled)return;
      render=p.render({canvasContext:el.getContext('2d'),viewport,transform:[output.scaleX,0,0,output.scaleY,0,0]});
      textLayer.current.replaceChildren();
      layer=new lib.TextLayer({textContentSource:content,container:textLayer.current,viewport});
      await Promise.all([render.promise,layer.render()]);
      if(!cancelled){setLoading(false);setRevision(n=>n+1);}
    }catch(e){if(!cancelled){setError('PDFを表示できませんでした。「元のPDF」か抽出テキストをご利用ください。');setLoading(false);}}})();
    return()=>{cancelled=true;render?.cancel();layer?.cancel();};
  },[book.id,book.sample,page,width,fitPage?height:0,fitPage,zoom,density]);
  return <div ref={container} className="pdf-stage" aria-busy={loading}>{loading&&<div className="pdf-loading" role="status"><LoaderCircle size={18} className="spin"/>ページを読み込んでいます…</div>}{error&&<div className="notice" role="alert">{error}</div>}
    <TermSurface pdf textRoot={textLayer} revision={revision} actions={actions} source={{bookId:book.id,page}} style={{width:dimensions.width,height:dimensions.height,visibility:loading||error?'hidden':'visible','--total-scale-factor':dimensions.scale} as React.CSSProperties}>
      <canvas ref={canvas} role="img" aria-label={book.title+' PDF '+page+'ページ。文字を選択して用語メモを登録できます。'}/>
      <div ref={textLayer} className="textLayer" aria-label="選択できるPDFの文字"/>
    </TermSurface>
  </div>;
}

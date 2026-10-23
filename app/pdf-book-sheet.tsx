import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Book} from './lib/library';
import {pdfLibrary} from './lib/pdf-client';
import {pdfCanvasResolution} from './lib/pdf-render-quality';
import {rememberPdfSelection,restorePdfSelection} from './lib/pdf-text-selection';
import {TermSurface,type TermActions} from './term-ui';

export type Sheet={number:number;pdf:any;ratio:number;baseHeight:number};
type Paint={key:string;width:number;height:number;scale:number;pixelsWide:number;pixelsHigh:number;buffer:HTMLCanvasElement;layer:HTMLDivElement};

/** The visible canvas stays intact while a new canvas and text layer render off screen. */
export default function PdfBookSheet({sheet,book,height,density,actions,renderKey,enabled,done,fail}:{sheet:Sheet;book:Book;height:number;density:number;actions:TermActions;renderKey:string;enabled:boolean;done:(page:number,key:string)=>void;fail:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),text=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null);
  const [paint,setPaint]=useState<Paint|null>(null),[revision,setRevision]=useState(0);
  const painted=useRef(false),paintedKey=useRef(''),held=useRef(false),waiting=useRef<Paint|null>(null),requested=useRef(renderKey);requested.current=renderKey;
  const callbacks=useRef({done,fail});callbacks.current={done,fail};
  const viewport=sheet.pdf.getViewport({scale:height/sheet.baseHeight});
  useEffect(()=>{
    const down=(event:PointerEvent)=>{if(frame.current?.contains(event.target as Node))held.current=true;};
    const release=()=>{held.current=false;const next=waiting.current;waiting.current=null;if(next?.key===requested.current)setPaint(next);else if(next)next.buffer.width=next.buffer.height=0;};
    window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);window.addEventListener('blur',release);
    return()=>{window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);window.removeEventListener('blur',release);if(waiting.current)waiting.current.buffer.width=waiting.current.buffer.height=0;};
  },[]);
  useLayoutEffect(()=>{
    if(!paint||!canvas.current||!text.current)return;
    const selected=rememberPdfSelection(text.current);
    canvas.current.getContext('2d')!.drawImage(paint.buffer,0,0);
    text.current.replaceChildren(paint.layer);restorePdfSelection(text.current,selected);
    paint.buffer.width=paint.buffer.height=0;painted.current=true;paintedKey.current=paint.key;setRevision(value=>value+1);
    callbacks.current.done(sheet.number,paint.key);
  },[paint,sheet.number]);
  useEffect(()=>{
    if(!enabled||paintedKey.current===renderKey)return;
    let cancelled=false,render:any,layer:any,buffer:HTMLCanvasElement|null=null;
    if(waiting.current){waiting.current.buffer.width=waiting.current.buffer.height=0;waiting.current=null;}
    const timer=setTimeout(()=>{
      (async()=>{try{
        const lib=await pdfLibrary();if(cancelled)return;
        const view=sheet.pdf.getViewport({scale:height/sheet.baseHeight}),output=pdfCanvasResolution(view.width,view.height,density);
        buffer=document.createElement('canvas');buffer.width=output.width;buffer.height=output.height;
        const textElement=document.createElement('div');textElement.className='textLayer';
        const content=await sheet.pdf.getTextContent();if(cancelled)return;
        render=sheet.pdf.render({canvasContext:buffer.getContext('2d'),viewport:view,transform:[output.scaleX,0,0,output.scaleY,0,0]});
        layer=new lib.TextLayer({textContentSource:content,container:textElement,viewport:view});
        await Promise.all([render.promise,layer.render()]);
        if(cancelled||!canvas.current||requested.current!==renderKey)return;
        const next={key:renderKey,width:view.width,height:view.height,scale:view.scale*(view.userUnit||1),pixelsWide:output.width,pixelsHigh:output.height,buffer,layer:textElement};
        if(held.current)waiting.current=next;else setPaint(next);
      }catch(error){if(!cancelled){console.error('PDF sheet rendering failed',error);callbacks.current.fail();}}})();
    },painted.current?110:0);
    return()=>{cancelled=true;clearTimeout(timer);render?.cancel();layer?.cancel();if(buffer){const abandoned=buffer;Promise.resolve(render?.promise).catch(()=>{}).then(()=>{abandoned.width=abandoned.height=0;});}};
  },[sheet.pdf,sheet.number,height,density,renderKey,enabled]);
  const width=paint?.width||viewport.width,paintHeight=paint?.height||viewport.height;
  return <TermSurface pdf textRoot={text} revision={revision} actions={actions} source={{bookId:book.id,page:sheet.number}} style={{width:viewport.width,height:viewport.height} as React.CSSProperties}>
    <div ref={frame} className="pdf-render-frame" data-painted-key={paint?.key} style={{width,height:paintHeight,transform:`scale(${viewport.width/width},${viewport.height/paintHeight})`,'--total-scale-factor':paint?.scale||viewport.scale*(viewport.userUnit||1)} as React.CSSProperties}>
      <canvas ref={canvas} width={paint?.pixelsWide||1} height={paint?.pixelsHigh||1} style={{width,height:paintHeight}} role="img" aria-label={book.title+' PDF '+sheet.number+'ページ。文字を選択して練習や用語メモを作れます。'}/>
      <div ref={text} className="pdf-text-host" aria-label={'選択できるPDF '+sheet.number+'ページの文字'}/>
    </div>
  </TermSurface>;
}

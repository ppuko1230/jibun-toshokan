import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {paperEdges,type PdfLayout} from './lib/pdf-book';
import {NotebookPen} from 'lucide-react';
import {usePageTurnSound} from './lib/use-page-turn-sound';

type Paper={canvas:HTMLCanvasElement;number:number;active:boolean;x:number;y:number;width:number;height:number};
type Frame={key:string;first:number;last:number;layout:PdfLayout;height:number;x:number;y:number;papers:Paper[]};
type Turn={id:string;direction:'forward'|'backward';previous:Frame;current:Frame};
export type PageMotion='system'|'on'|'off';

/** Decorative, local canvas copies. The real PDF text layer remains selectable underneath. */
export function useBookPageTurn(stage:RefObject<HTMLDivElement|null>,key:string,first:number,last:number,layout:PdfLayout,renderKey:string,busy:boolean,height:number,motion:PageMotion,sound:boolean){
  const playSound=usePageTurnSound(sound),soundFrame=useRef<{key:string;first:number;last:number;layout:PdfLayout}|null>(null);
  const frame=useRef<Frame|null>(null),pending=useRef<{key:string;previous:Frame}|null>(null),previousKey=useRef(key);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),[turn,setTurn]=useState<Turn|null>(null);
  const reduced=useRef(false);
  const mode=useRef(motion);mode.current=motion;
  function finish(){if(timer.current)clearTimeout(timer.current);timer.current=null;setTurn(null);}
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');reduced.current=media.matches;const changed=()=>{reduced.current=media.matches;if(media.matches&&mode.current==='system'){pending.current=null;finish();}};media.addEventListener('change',changed);return()=>{media.removeEventListener('change',changed);if(timer.current)clearTimeout(timer.current);};},[]);
  useEffect(()=>{pending.current=null;finish();},[motion]);
  useLayoutEffect(()=>{
    if(previousKey.current===key)return;
    const before=frame.current;pending.current=null;finish();
    if(before&&before.layout===layout&&motion!=='off'&&(motion==='on'||!reduced.current)&&(first===before.last+1||last===before.first-1))pending.current={key,previous:before};
    previousKey.current=key;
  },[key,first,last,layout]);
  useLayoutEffect(()=>{
    if(busy)return;
    const node=stage.current,body=node?.querySelector<HTMLElement>('.book-model:not([hidden]) .book-paper-body');if(!body)return;
    const bounds=body.getBoundingClientRect(),stageBounds=node!.getBoundingClientRect();
    const papers=Array.from(body.querySelectorAll<HTMLElement>('.book-sheet')).map(sheet=>{
      const canvas=sheet.querySelector<HTMLCanvasElement>('canvas'),rect=sheet.getBoundingClientRect();
      if(!canvas?.width||!canvas.height)return null;
      return {canvas,number:Number(sheet.dataset.pdfPage),active:sheet.classList.contains('is-active'),x:rect.left-bounds.left,y:rect.top-bounds.top,width:rect.width,height:canvas.getBoundingClientRect().height};
    }).filter((paper):paper is Paper=>!!paper);
    if(!papers.length)return;
    const current={key,first,last,layout,height,x:bounds.left-stageBounds.left+node!.scrollLeft-node!.clientLeft,y:bounds.top-stageBounds.top+node!.scrollTop-node!.clientTop,papers},waiting=pending.current;
    pending.current=null;frame.current=current;finish();
    const previousSound=soundFrame.current;soundFrame.current={key,first,last,layout};
    if(previousSound&&previousSound.key!==key&&previousSound.layout===layout&&(first===previousSound.last+1||last===previousSound.first-1))playSound();
    if(waiting?.key===key&&motion!=='off'&&(motion==='on'||!reduced.current)&&Math.abs(waiting.previous.height-height)<2){
      setTurn({id:renderKey,direction:first>waiting.previous.first?'forward':'backward',previous:waiting.previous,current});
      timer.current=setTimeout(finish,420);
    }
  },[busy,renderKey]);
  // Resizing/zooming during a turn must never leave a detached paper or block controls.
  useLayoutEffect(()=>{if(turn&&turn.id!==renderKey)finish();},[renderKey,turn]);
  // Keep the last painted canvases visible until every destination sheet is ready.
  // Canvas copies paint synchronously, without waiting for image decoding.
  return {turn,preview:busy&&frame.current?.key!==key?frame.current:null,finish};
}

export function BookPagePreview({frame,total}:{frame:Frame;total:number}){
  const edges=paperEdges(frame.first,frame.last,total);
  return <div className="book-page-preview" aria-hidden="true" style={{left:frame.x,top:frame.y}}>
    <div className="book-paper-body">
      <div className="book-board"/><PreviewEdge side="left" width={edges.left}/>
      {frame.papers.map((paper,i)=><div className="book-page-unit" key={paper.number}>
        {i>0&&<div className="book-gutter"/>}
        <div className={'book-sheet '+(paper.active?'is-active':'')} style={{width:paper.width}}>
          <PreviewCanvas paper={paper}/>
          <div className="book-sheet-caption"><span className="book-preview-caption"><NotebookPen size={13}/>PDF {paper.number}<small>{paper.active?'選択中':'補足を書く'}</small></span></div>
        </div>
      </div>)}
      <PreviewEdge side="right" width={edges.right}/><div className="book-board"/>
    </div>
  </div>;
}
function PreviewCanvas({paper,className,style}:{paper:Paper;className?:string;style?:React.CSSProperties}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useLayoutEffect(()=>{canvas.current?.getContext('2d')?.drawImage(paper.canvas,0,0);},[paper]);
  return <canvas ref={canvas} className={className} width={paper.canvas.width} height={paper.canvas.height} style={style||{width:paper.width,height:paper.height}}/>;
}
function PreviewEdge({side,width}:{side:'left'|'right';width:number}){
  return <div className={'book-paper-edge '+side} style={{width}}>{Array.from({length:Math.ceil(width/3)},(_,i)=><span key={i}/>)}</div>;
}

export function BookPageTurn({turn,finish,motion}:{turn:Turn;finish:()=>void;motion:PageMotion}){
  const {previous,current,direction}=turn,forward=direction==='forward';
  if(previous.papers.length!==2||current.papers.length!==2)return null;
  const [left,right]=current.papers,gutter=right.x-left.x-left.width;
  const stationary=forward?left:right,oldStationary=previous.papers[forward?0:1],front=previous.papers[forward?1:0],back=current.papers[forward?0:1];
  const leaf={left:forward?left.x+left.width:left.x,top:0,width:(forward?right.width:left.width)+gutter,height:heightOf(left,right),'--turn-inset':(forward?gutter:0)+'px','--turn-paper-width':(forward?right.width:left.width)+'px'} as React.CSSProperties;
  return <div className={'book-turn-layer '+direction} data-motion={motion} aria-hidden="true">
    <PreviewCanvas className="book-turn-stationary" paper={oldStationary} style={{left:stationary.x,top:stationary.y,width:stationary.width,height:stationary.height}}/>
    <div className="book-turn-leaf" style={leaf} onAnimationEnd={e=>{if(e.target===e.currentTarget)finish();}}>
      <div className="book-turn-face front"><PreviewCanvas paper={front} style={{}}/><span/></div>
      <div className="book-turn-face back"><PreviewCanvas paper={back} style={{}}/><span/></div>
    </div>
  </div>;
}
function heightOf(a:Paper,b:Paper){return Math.max(a.height,b.height);}

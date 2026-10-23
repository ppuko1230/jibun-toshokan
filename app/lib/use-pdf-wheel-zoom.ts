import {useEffect,useLayoutEffect,useRef,type Dispatch,type RefObject,type SetStateAction} from 'react';
import {clampPdfZoom,pdfZoomFromWheel} from './pdf-zoom';

type Anchor={x:number;y:number;clientX:number;clientY:number};
export function usePdfWheelZoom(root:RefObject<HTMLDivElement|null>,enabled:boolean,zoom:number,setZoom:Dispatch<SetStateAction<number>>,minimum=1){
  const control=useRef({shown:zoom,target:zoom,published:zoom,minimum,frame:0,time:0,anchor:null as Anchor|null});
  useLayoutEffect(()=>{
    const state=control.current;
    if(Math.abs(zoom-state.published)>.00001||state.minimum!==minimum){cancelAnimationFrame(state.frame);state.frame=0;state.target=zoom;state.anchor=null;}
    state.minimum=minimum;
    state.shown=state.published=zoom;
    if(!enabled||!state.anchor)return;
    const stage=root.current?.querySelector<HTMLElement>('.pdf-stage'),paper=stage?.querySelector<HTMLElement>('.book-paper-body');if(!stage||!paper)return;
    const box=paper.getBoundingClientRect(),anchor=state.anchor;
    stage.scrollLeft+=box.left+box.width*anchor.x-anchor.clientX;
    stage.scrollTop+=box.top+box.height*anchor.y-anchor.clientY;
  },[root,enabled,zoom,minimum]);
  useEffect(()=>{
    if(!enabled)return;
    const stage=root.current?.querySelector<HTMLElement>('.pdf-stage');if(!stage)return;
    const state=control.current;state.target=state.shown;
    const stop=()=>{cancelAnimationFrame(state.frame);state.frame=0;state.target=state.shown;state.anchor=null;state.time=0;};
    const animate=(now:number)=>{
      if(stage.dataset.panning==='true'){stop();return;}
      const elapsed=Math.min(32,state.time?now-state.time:16);state.time=now;
      let next=clampPdfZoom(state.shown+(state.target-state.shown)*(1-Math.exp(-elapsed/45)),minimum);
      if(Math.abs(next-state.target)<.0006)next=state.target;
      state.shown=state.published=next;setZoom(next);
      state.frame=next===state.target?0:requestAnimationFrame(animate);
    };
    const wheel=(event:WheelEvent)=>{
      if(event.defaultPrevented||!event.deltaY||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      if((event.target as Element)?.closest('input,textarea,select,[role="dialog"],[role="listbox"]'))return;
      event.preventDefault();if(stage.dataset.panning==='true'||stage.getAttribute('aria-busy')==='true')return;
      const paper=stage.querySelector<HTMLElement>('.book-paper-body'),box=paper?.getBoundingClientRect();
      if(box?.width&&box.height)state.anchor={x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height)),clientX:event.clientX,clientY:event.clientY};
      state.target=pdfZoomFromWheel(state.frame?state.target:state.shown,event.deltaY,event.deltaMode,stage.clientHeight,minimum);
      if(!state.frame){state.time=0;state.frame=requestAnimationFrame(animate);}
    };
    stage.addEventListener('wheel',wheel,{passive:false});stage.addEventListener('pointerdown',stop,true);
    return()=>{stop();stage.removeEventListener('wheel',wheel);stage.removeEventListener('pointerdown',stop,true);};
  },[root,enabled,setZoom,minimum]);
}

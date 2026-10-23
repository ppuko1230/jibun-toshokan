import {useEffect,useRef,type RefObject} from 'react';

export function useBookPan(stage:RefObject<HTMLDivElement|null>,onStart:()=>void){
  const start=useRef(onStart);start.current=onStart;
  useEffect(()=>{
    const node=stage.current;if(!node)return;
    let space=false,middle=false,drag:{id:number;buttons:number;x:number;y:number;left:number;top:number}|null=null;
    const editable=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="alertdialog"]');
    const blocked=(target:EventTarget|null)=>!(target instanceof Element)||!!target.closest('a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="alertdialog"],.selection-tools,.term-popover')||!!target.closest('button:not(.term-hit)');
    const inViewport=(event:MouseEvent)=>{const box=node.getBoundingClientRect();return event.clientX>=box.left&&event.clientY>=box.top&&event.clientX<box.left+node.clientWidth&&event.clientY<box.top+node.clientHeight;};
    const ready=()=>{node.dataset.panReady=String(space);};
    const finish=()=>{const id=drag?.id;drag=null;delete node.dataset.panning;if(id!==undefined&&node.hasPointerCapture(id))node.releasePointerCapture(id);};
    const down=(event:PointerEvent)=>{
      if(drag||event.button!==1&&event.button!==2&&!(event.button===0&&space))return;
      if(blocked(event.target)||!inViewport(event)||document.querySelector('[aria-modal="true"]'))return;
      event.preventDefault();event.stopPropagation();start.current();
      window.getSelection()?.removeAllRanges();middle=event.button===1;
      drag={id:event.pointerId,buttons:event.button===2?2:event.button===1?4:1,x:event.clientX,y:event.clientY,left:node.scrollLeft,top:node.scrollTop};
      node.dataset.panning='true';node.setPointerCapture(event.pointerId);node.focus({preventScroll:true});
    };
    const move=(event:PointerEvent)=>{if(!drag||event.pointerId!==drag.id)return;if(!(event.buttons&drag.buttons)){finish();return;}event.preventDefault();node.scrollLeft=drag.left+drag.x-event.clientX;node.scrollTop=drag.top+drag.y-event.clientY;};
    const up=(event:PointerEvent)=>{if(event.pointerId===drag?.id)finish();};
    const keyDown=(event:KeyboardEvent)=>{
      if(event.code!=='Space'||editable(event.target)||document.querySelector('[aria-modal="true"]'))return;
      if(event.target instanceof Element&&event.target.closest('button,a')&&!node.matches(':hover'))return;
      if(!node.matches(':hover,:focus,:focus-within'))return;
      event.preventDefault();space=true;ready();
    };
    const keyUp=(event:KeyboardEvent)=>{if(event.code==='Space'&&space){event.preventDefault();space=false;ready();}};
    const blur=()=>{space=false;middle=false;finish();ready();};
    const auxiliary=(event:MouseEvent)=>{if(event.button===1&&middle){event.preventDefault();middle=false;}};
    // The paper reserves the right button for panning; controls keep their native menus.
    const context=(event:MouseEvent)=>{if(event.button===2&&!blocked(event.target)&&inViewport(event)&&!document.querySelector('[aria-modal="true"]'))event.preventDefault();};
    ready();node.addEventListener('pointerdown',down,true);node.addEventListener('pointermove',move);node.addEventListener('lostpointercapture',finish);
    node.addEventListener('auxclick',auxiliary);node.addEventListener('contextmenu',context);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
    window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);
    return()=>{finish();delete node.dataset.panReady;node.removeEventListener('pointerdown',down,true);node.removeEventListener('pointermove',move);node.removeEventListener('lostpointercapture',finish);node.removeEventListener('auxclick',auxiliary);node.removeEventListener('contextmenu',context);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);};
  },[stage]);
}

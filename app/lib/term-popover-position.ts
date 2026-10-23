export type TermAnchor={left:number;top:number;width:number;height:number};
type Size={width:number;height:number};
export function termPopoverPosition(anchor:TermAnchor,popup:Size,viewport:Size){
  const edge=16,gap=24,width=Math.min(popup.width,Math.max(0,viewport.width-edge*2)),height=Math.min(popup.height,Math.max(0,viewport.height-edge*2));
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(n,Math.max(min,max)));
  const centerX=anchor.left+anchor.width/2,centerY=anchor.top+anchor.height/2,right=anchor.left+anchor.width,bottom=anchor.top+anchor.height;
  const top=clamp(centerY-height/2,edge,viewport.height-height-edge),left=clamp(centerX-width/2,edge,viewport.width-width-edge);
  if(right+gap+width<=viewport.width-edge)return {left:right+gap,top,side:'right' as const,arrowOffset:clamp(centerY-top,20,height-20)};
  if(anchor.left-gap-width>=edge)return {left:anchor.left-gap-width,top,side:'left' as const,arrowOffset:clamp(centerY-top,20,height-20)};
  const below=viewport.height-edge-bottom-gap,above=anchor.top-gap-edge;
  const side=below>=height||below>=above&&above<height?'bottom' as const:'top' as const;
  return {left,top:clamp(side==='bottom'?bottom+gap:anchor.top-gap-height,edge,viewport.height-height-edge),side,arrowOffset:clamp(centerX-left,20,width-20)};
}

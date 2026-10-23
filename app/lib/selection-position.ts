export type SelectionAnchor={left:number;right:number;top:number;bottom:number};
export function selectionToolbarPosition(anchor:SelectionAnchor,size:{width:number;height:number},viewport:{width:number;height:number}){
  const margin=12,gap=10,width=Math.min(size.width,viewport.width-margin*2),height=Math.min(size.height,viewport.height-margin*2);
  const left=Math.max(margin,Math.min((anchor.left+anchor.right-width)/2,viewport.width-width-margin));
  const below=anchor.bottom+gap,above=anchor.top-height-gap;
  const top=Math.max(margin,Math.min(below+height<=viewport.height-margin?below:above,viewport.height-height-margin));
  return {left,top};
}

export type GuideKind='library'|'reader';
export type GuideSeen=Partial<Record<GuideKind,true>>;
export function validGuideSeen(value:unknown):value is GuideSeen{
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,seen])=>(key==='library'||key==='reader')&&seen===true);
}
export type GuideRect={left:number;top:number;width:number;height:number};
export function guidePlacement(target:GuideRect|null,card:{width:number;height:number},viewport:{width:number;height:number}){
  const gap=18,edge=12,maxX=Math.max(edge,viewport.width-card.width-edge),maxY=Math.max(edge,viewport.height-card.height-edge);
  const clamp=(n:number,max:number)=>Math.max(edge,Math.min(max,n));
  if(!target)return {left:clamp((viewport.width-card.width)/2,maxX),top:clamp((viewport.height-card.height)/2,maxY)};
  const candidates=[
    {left:clamp(target.left+target.width/2-card.width/2,maxX),top:target.top+target.height+gap},
    {left:clamp(target.left+target.width/2-card.width/2,maxX),top:target.top-card.height-gap},
    {left:target.left-card.width-gap,top:clamp(target.top+target.height/2-card.height/2,maxY)},
    {left:target.left+target.width+gap,top:clamp(target.top+target.height/2-card.height/2,maxY)},
  ];
  return candidates.find(p=>p.left>=edge&&p.top>=edge&&p.left<=maxX&&p.top<=maxY)||{left:clamp(target.left+target.width-card.width,maxX),top:clamp(target.top+target.height+gap,maxY)};
}

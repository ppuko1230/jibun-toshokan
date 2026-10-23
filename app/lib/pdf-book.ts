export type PdfLayout='single'|'spread';

export function pdfRange(page:number,total:number,layout:PdfLayout){
  const current=Math.max(1,Math.min(total,page));
  const first=layout==='spread'?current-(current-1)%2:current;
  return {first,last:Math.min(total,first+(layout==='spread'?1:0))};
}

/** Current spread and its immediate neighbours: at most six physical pages. */
export function pdfWindow(page:number,total:number,layout:PdfLayout){
  const current=pdfRange(page,total,layout),step=layout==='spread'?2:1;
  return [current.first-step,current.first,current.first+step].filter(first=>first>=1&&first<=total).map(first=>pdfRange(first,total,layout));
}

export function adjacentPdfPage(page:number,total:number,layout:PdfLayout,direction:-1|1):number|null{
  const {first,last}=pdfRange(page,total,layout);
  if(direction<0&&first===1||direction>0&&last===total)return null;
  return direction<0?Math.max(1,first-(layout==='spread'?2:1)):last+1;
}

export function paperEdges(first:number,last:number,total:number){
  const before=Math.max(0,first-1),after=Math.max(0,total-last);
  const thickness=Math.min(64,12+Math.sqrt(total)*4);
  return {before,after,left:Math.round(thickness*before/total),right:Math.round(thickness*after/total)};
}

export function bookPageHeight(ratios:number[],availableWidth:number,availableHeight:number,fitPage:boolean,zoom:number,edgeWidth:number){
  const widthHeight=Math.max(40,availableWidth-edgeWidth-(ratios.length>1?12:0))/ratios.reduce((sum,r)=>sum+r,0);
  return Math.max(40,Math.min(widthHeight,fitPage?Math.max(40,availableHeight):Infinity))*zoom;
}

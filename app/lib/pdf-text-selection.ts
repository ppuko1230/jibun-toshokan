/** Keep a completed text selection when a sharper copy of the same PDF page arrives. */
export function rememberPdfSelection(root:HTMLElement){
  const selection=window.getSelection();
  if(!selection?.anchorNode||!selection.focusNode||selection.isCollapsed||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null;
  const offset=(node:Node,position:number)=>{const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,position);return range.toString().length;};
  return {anchor:offset(selection.anchorNode,selection.anchorOffset),focus:offset(selection.focusNode,selection.focusOffset)};
}

export function restorePdfSelection(root:HTMLElement,saved:{anchor:number;focus:number}|null){
  if(!saved)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes:{node:Node;start:number;end:number}[]=[];
  let length=0,node:Node|null;while((node=walker.nextNode())){const end=length+(node.textContent?.length||0);nodes.push({node,start:length,end});length=end;}
  const point=(offset:number)=>{const item=nodes.find(item=>offset>=item.start&&offset<=item.end);return item?{node:item.node,offset:offset-item.start}:null;};
  const anchor=point(saved.anchor),focus=point(saved.focus);
  if(anchor&&focus)window.getSelection()?.setBaseAndExtent(anchor.node,anchor.offset,focus.node,focus.offset);
}

export type ReaderView={
  pdfLayout?:'single'|'spread';
  codeScroll?:Record<string,number>;
  webFile?:string;
  page:number;zoom:number;windowX:number;windowY:number;pdfX:number;pdfY:number;textY:number;
  textMode:boolean;notesOpen:boolean;expanded:boolean;capturedAt:number;
};

export function validReaderView(value:unknown):value is ReaderView{
  if(!value||typeof value!=='object')return false;
  const v=value as ReaderView;
  return Number.isInteger(v.page)&&v.page>=1&&v.page<=1000&&Number.isFinite(v.zoom)&&v.zoom>=.7&&v.zoom<=2
    &&[v.windowX,v.windowY,v.pdfX,v.pdfY,v.textY].every(n=>Number.isFinite(n)&&n>=0&&n<=1000000)
    &&(v.codeScroll===undefined||!!v.codeScroll&&typeof v.codeScroll==='object'&&!Array.isArray(v.codeScroll)&&Object.keys(v.codeScroll).length<=300&&Object.entries(v.codeScroll).every(([key,n])=>key.length<=160&&Number.isFinite(n)&&n>=0&&n<=1000000))
    &&[v.textMode,v.notesOpen,v.expanded].every(b=>typeof b==='boolean')
    &&(v.webFile===undefined||typeof v.webFile==='string'&&v.webFile.length>0&&v.webFile.length<=160)
    &&(v.pdfLayout===undefined||v.pdfLayout==='single'||v.pdfLayout==='spread')
    &&Number.isSafeInteger(v.capturedAt)&&v.capturedAt>0;
}

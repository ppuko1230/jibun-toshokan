const MAX_PIXELS=12_000_000,MAX_SIDE=8192;

/** Render from PDF vectors at the display size, with extra samples for fine text. */
export function pdfCanvasResolution(width:number,height:number,devicePixelRatio:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('PDFの描画サイズが正しくありません。');
  const density=Math.max(2,Math.min(3,Number.isFinite(devicePixelRatio)?devicePixelRatio:1));
  const scale=Math.min(density,Math.sqrt(MAX_PIXELS/(width*height)),MAX_SIDE/width,MAX_SIDE/height);
  const pixelsWide=Math.max(1,Math.floor(width*scale)),pixelsHigh=Math.max(1,Math.floor(height*scale));
  return {width:pixelsWide,height:pixelsHigh,scaleX:pixelsWide/width,scaleY:pixelsHigh/height};
}

export function clampPdfZoom(value:number,minimum=.7){
  return Math.min(2,Math.max(minimum,Math.round(value*10000)/10000));
}

/** Continuous wheel/pinch input, sharing the toolbar's zoom bounds. */
export function pdfZoomFromWheel(current:number,deltaY:number,deltaMode:number,pageHeight:number,minimum=1){
  const pixels=deltaY*(deltaMode===1?16:deltaMode===2?pageHeight:1);
  if(!Number.isFinite(pixels))return current;
  return clampPdfZoom(current*Math.exp(-Math.max(-240,Math.min(240,pixels))*.0018),minimum);
}

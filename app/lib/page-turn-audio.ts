/** Thin paper: a soft airy swish, rising into a short, light "shoo-wit". */
export function pageTurnSamples(sampleRate:number){
  const samples=new Float32Array(Math.ceil(sampleRate*.28));let seed=271828,x1=0,x2=0,y1=0,y2=0,air=0;
  const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
  for(let i=0;i<samples.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)|0;const white=(seed>>>0)/2147483648-1,t=i/sampleRate;
    const rise=smooth((t-.115)/.12),frequency=2200+3400*rise,omega=2*Math.PI*frequency/sampleRate,alpha=Math.sin(omega)/(2*(.72+.35*rise)),a0=1+alpha;
    const filtered=(alpha*white-alpha*x2+2*Math.cos(omega)*y1-(1-alpha)*y2)/a0;x2=x1;x1=white;y2=y1;y1=filtered;
    air=.34*air+.66*white;
    const envelope=smooth(t/.045)*(1-smooth((t-.205)/.075));
    const gesture=.7+.3*Math.exp(-Math.pow((t-.19)/.033,2));
    samples[i]=(filtered*.86+(white-air)*.14)*envelope*gesture*.105;
  }
  return samples;
}

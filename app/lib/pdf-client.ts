let library:Promise<any>|undefined;
export function pdfLibrary():Promise<any>{
  if(!library){library=new Promise((resolve,reject)=>{
    const existing=(window as any).yohakuPdf;
    if(existing){resolve(existing);return;}
    const script=document.createElement('script');script.type='module';script.src='/vendor/pdfjs/loader.mjs';
    script.onload=()=>{const mod=(window as any).yohakuPdf;if(mod){mod.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';resolve(mod);}else reject(new Error('PDF表示機能を読み込めません。'));};
    script.onerror=()=>{script.remove();reject(new Error('PDF表示機能を読み込めません。'));};document.head.appendChild(script);
  }).catch(e=>{library=undefined;throw e;});}
  return library;
}
export const pdfOptions={cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',isEvalSupported:false};
const documents=new Map<string,Promise<any>>();
export function pdfDocument(id:string,url:string):Promise<any>{
  const cached=documents.get(id);if(cached)return cached;
  const promise=pdfLibrary().then(lib=>lib.getDocument({...pdfOptions,url,disableRange:true,disableStream:true}).promise).catch(e=>{documents.delete(id);throw e;});
  documents.set(id,promise);
  if(documents.size>3){const first=documents.keys().next().value;if(first){const old=documents.get(first);documents.delete(first);old?.then(doc=>doc.destroy()).catch(()=>{});}}
  return promise;
}

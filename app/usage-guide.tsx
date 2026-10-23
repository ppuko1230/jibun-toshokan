import {useCallback,useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {ArrowRight,ChevronLeft,X,LoaderCircle} from 'lucide-react';
import {guidePlacement,type GuideKind,type GuideSeen,type GuideRect} from './lib/usage-guide';
import './usage-guide.css';

type Step={target:string;title:string;text:string};
type Props={root:RefObject<HTMLDivElement|null>;ready:boolean;blocked:boolean;screen:GuideKind|'other';seen:GuideSeen;hasBooks:boolean;request:{kind:GuideKind;id:number}|null;readerAvailable:(ready:boolean)=>void;finish:(kind:GuideKind)=>Promise<boolean>};
function visible(node:HTMLElement){const r=node.getBoundingClientRect(),style=getComputedStyle(node);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none';}
function targetFor(root:HTMLElement,selector:string){const nodes=Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(visible);return nodes.find(node=>{const r=node.getBoundingClientRect();return r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;})||nodes[0]||null;}
export default function UsageGuide(props:Props){
  const [kind,setKind]=useState<GuideKind|null>(null),[step,setStep]=useState(0),[pdfReady,setPdfReady]=useState(false);
  const dismissed=useRef(new Set<GuideKind>()),requested=useRef(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const finishRef=useRef(props.finish);finishRef.current=props.finish;
  useEffect(()=>{const root=props.root.current;if(!root)return;const check=()=>{const pdf=root.querySelector<HTMLElement>('.book-stage[aria-busy="false"]'),ready=!!pdf&&visible(pdf);setPdfReady(ready);props.readerAvailable(ready);};check();const observer=new MutationObserver(check);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','hidden']});return()=>observer.disconnect();},[props.root,props.readerAvailable]);
  useEffect(()=>{
    if(kind||!props.ready||props.blocked)return;
    if(props.request&&props.request.id!==requested.current){
      if(props.request.kind==='reader'&&!pdfReady||props.request.kind!==props.screen)return;
      requested.current=props.request.id;setStep(0);setError('');setKind(props.request.kind);return;
    }
    const current=props.screen;
    if(current==='other'||current==='reader'&&!pdfReady||props.seen[current]||dismissed.current.has(current))return;
    setStep(0);setError('');setKind(current);
  },[kind,props.ready,props.blocked,props.screen,props.request,props.seen,pdfReady]);
  // A guide never follows navigation into another screen or covers a real dialog.
  const active=kind&&props.screen===kind&&!props.blocked&&(kind!=='reader'||pdfReady)?kind:null;
  const close=useCallback(()=>{if(kind)dismissed.current.add(kind);setKind(null);setError('');},[kind]);
  const save=useCallback(async()=>{if(!kind||busy)return;setBusy(true);setError('');try{if(await finishRef.current(kind))close();else setError('案内の表示状態を保存できませんでした。もう一度試すか、今回は閉じてください。');}finally{setBusy(false);}},[kind,busy,close]);
  if(!active)return null;
  const steps:Step[]=active==='library'?[
    {target:'[data-guide="add-pdf"]',title:'自分のPDFを、本棚へ。',text:'ここから教材や読みたいPDFを追加します。追加したPDFの文字は、ほかの本やメモとまとめて検索できます。'},
    {target:'[data-guide="library-book"],[data-guide="empty-library"]',title:props.hasBooks?'読みたい本をひらく':'本を入れたら、ここから。',text:props.hasBooks?'「ひらく」「続きから」で読書を始めます。読んでいたページは自動で残り、次回も続きから開けます。':'追加した本はここに並びます。本をひらくと、ページ送りやメモの使い方も短く案内します。'},
    {target:'[data-guide="library-search"]',title:'あの言葉を、まとめて探す。',text:'言葉を入力すると、PDFの本文・ページの補足・用語メモを横断して探せます。検索結果から、そのページへ戻れます。'},
    {target:'[data-guide="app-settings"]',title:'設定とバックアップは、ここ。',text:'文字の大きさやバックアップを設定できます。この案内も設定から何度でも見直せます。'},
  ]:[
    {target:'.book-side-nav.next',title:'本をめくるように、読む。',text:'本の左右にある矢印、またはキーボードの ← → でページを送ります。マウスホイールを上へ回すと拡大、下へ回すと縮小します。'},
    {target:'.book-pointer-help',title:'左で選ぶ。右で動かす。',text:'アイコンの色が付いた側のボタンを押しながらドラッグします。左は文字選択、右は紙面をつかんで移動です。切り替え操作は必要ありません。言葉を選ぶと用語メモや虫食い問題を作れます。'},
    {target:'.fullscreen-chrome-toggle,.reading-primary-actions',title:'補足や音の設定は、操作メニューへ。',text:'全画面では上の小さな操作ボタンからメニューを開けます。「補足を書く」で理解を残し、「ツール」でしおりやページをめくる音を設定できます。'},
  ];
  return <Spotlight key={active} root={props.root} kind={active} step={step} steps={steps} busy={busy} error={error} back={()=>setStep(n=>Math.max(0,n-1))} next={()=>step===steps.length-1?void save():setStep(n=>n+1)} close={()=>void save()} dismiss={close}/>;
}

function Spotlight({root,kind,step,steps,busy,error,back,next,close,dismiss}:{root:Props['root'];kind:GuideKind;step:number;steps:Step[];busy:boolean;error:string;back:()=>void;next:()=>void;close:()=>void;dismiss:()=>void}){
  const overlay=useRef<HTMLDivElement>(null),card=useRef<HTMLDivElement>(null),nextButton=useRef<HTMLButtonElement>(null);
  const [geometry,setGeometry]=useState<{target:GuideRect|null;left:number;top:number}|null>(null);
  const closeRef=useRef(close);closeRef.current=close;const busyRef=useRef(busy);busyRef.current=busy;
  useEffect(()=>{const frame=requestAnimationFrame(()=>nextButton.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[step]);
  useLayoutEffect(()=>{
    const app=root.current,panel=card.current;if(!app||!panel)return;
    const node=targetFor(app,steps[step].target);
    if(kind==='library')node?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    const measure=()=>{
      const found=targetFor(app,steps[step].target),rect=found?.getBoundingClientRect();
      const left=Math.max(4,(rect?.left||0)-7),top=Math.max(4,(rect?.top||0)-7),right=Math.min(innerWidth-4,(rect?.right||0)+7),bottom=Math.min(innerHeight-4,(rect?.bottom||0)+7);
      const target=rect&&right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
      const size=panel.getBoundingClientRect();setGeometry({target,...guidePlacement(target,{width:size.width,height:size.height},{width:innerWidth,height:innerHeight})});
    };
    measure();const resize=new ResizeObserver(measure);resize.observe(panel);if(node)resize.observe(node);
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
    return()=>{resize.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[step,kind,root,steps[step].target]);
  useEffect(()=>{
    const app=root.current,previous=document.activeElement as HTMLElement|null;
    const siblings=app?Array.from(app.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==overlay.current):[];
    const inert=siblings.map(node=>[node,node.inert] as const);for(const [node] of inert)node.inert=true;
    const overflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    nextButton.current?.focus({preventScroll:true});
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!busyRef.current)closeRef.current();}
      else if(e.key==='Tab'){
        const buttons=Array.from(card.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);if(!buttons.length){e.preventDefault();return;}
        const first=buttons[0],last=buttons.at(-1)!;
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last||!card.current?.contains(document.activeElement)){e.preventDefault();first.focus();}
      }else if(e.key.startsWith('Arrow')||(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();}
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);for(const [node,value] of inert)node.inert=value;document.documentElement.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});else app?.querySelector<HTMLElement>('#workspace')?.focus({preventScroll:true});};
  },[root]);
  return <div ref={overlay} className="usage-guide" data-usage-guide={kind} role="dialog" aria-modal="true" aria-labelledby="usage-guide-title" aria-describedby="usage-guide-text" onWheel={e=>{if(!(e.target as Element).closest('.usage-guide-card'))e.preventDefault();}}>
    {geometry?.target?<div className="usage-guide-spotlight" aria-hidden="true" style={geometry.target}/>:<div className="usage-guide-shade" aria-hidden="true"/>}
    <div ref={card} className="usage-guide-card" style={{left:geometry?.left||12,top:geometry?.top||12,visibility:geometry?'visible':'hidden'}}>
      <div className="usage-guide-top"><span>{kind==='library'?'はじめの本棚案内':'はじめの読書案内'}</span><button className="icon-button" aria-label="使い方ガイドを閉じる" disabled={busy} onClick={close}><X size={18}/></button></div>
      <div aria-live="polite" aria-atomic="true"><p className="usage-guide-count">{step+1} / {steps.length}</p><h2 id="usage-guide-title">{steps[step].title}</h2><p id="usage-guide-text">{steps[step].text}</p></div>
      {error&&<p className="notice" role="alert">{error}<button className="text-button" onClick={dismiss}>今回は閉じる</button></p>}
      <div className="usage-guide-actions"><button className="text-button" onClick={close} disabled={busy}>あとで</button><div>{step>0&&<button className="button small" onClick={back} disabled={busy}><ChevronLeft size={16}/>戻る</button>}<button ref={nextButton} className="button primary small" onClick={next} disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:null}{step===steps.length-1?'案内を終える':'次へ'}{!busy&&<ArrowRight size={16}/>}</button></div></div>
    </div>
  </div>;
}

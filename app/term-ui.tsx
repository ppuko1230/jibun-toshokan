'use client';
import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {selectionToolbarPosition,type SelectionAnchor} from './lib/selection-position';
import {BookOpen,NotebookPen,Plus,X,Save,ArrowUpRight,LoaderCircle,Flag,Eye,Trash2,Play} from 'lucide-react';
import type {TermMemo} from './lib/term-types';
import {findTerm,scopeLabel,globalAlternatives} from './lib/term-types';
import {termMatches} from './lib/term-matches';
import TermBody from './term-body';
import TermReader,{MemoContent} from './term-reader';
import {termPopoverPosition,type TermAnchor} from './lib/term-popover-position';
import MemoRemovalDialog from './memo-removal-dialog';
export type TermSource={bookId:string;page:number;blockId?:string};
export type TermDraft={word:string;memo?:TermMemo;source?:TermSource;folderId?:string;folderName?:string;contextQuery?:string};
export type TermActions={terms:TermMemo[];edit:(word:string,source?:TermSource,memoId?:string,create?:boolean)=>void;openSource:(id:string,page:number)=>void;mark?:(quote:string,source:TermSource,existing?:import('./lib/web-types').Challenge)=>void;practice?:(text:string,source:TermSource,mode:'code'|'text')=>void};
export function TermCard({memo,edit,remove,openSource}:{memo:TermMemo;edit:()=>void;remove:()=>void;openSource:(id:string,page:number)=>void}){
  const [reading,setReading]=useState(false),long=memo.body.length>600||memo.body.split('\n').length>10;
  return <article className="term-card"><div className="term-card-heading"><span><BookOpen size={16}/>用語メモ</span><div className="memo-card-actions"><button className="text-button" onClick={edit}>編集する <NotebookPen size={14}/></button><button className="text-button memo-delete" aria-label={'「'+memo.term+'」の用語メモを削除'} onClick={remove}><Trash2 size={15}/>削除</button></div></div><span className={'memo-scope '+(memo.scopeFolderId?'is-local':'')}>{scopeLabel(memo)}</span><h3>{memo.term}</h3>{memo.aliases.length>0&&<p className="term-aliases">別名：{memo.aliases.join(' / ')}</p>}<div className={long?'term-card-excerpt':''}><TermBody body={memo.body}/></div><button className="text-button term-read-button" onClick={()=>setReading(true)}><BookOpen size={16}/>{long?'全文を大きく読む':'大きく読む'}</button>{memo.sourceBookId&&memo.sourcePage&&<button className="note-source" onClick={()=>openSource(memo.sourceBookId!,memo.sourcePage!)}>最初に書いたページ：{memo.sourceTitle||'教材'} · PDF {memo.sourcePage}ページ <ArrowUpRight size={15}/></button>}{reading&&<TermReader memo={memo} close={()=>setReading(false)} edit={()=>{setReading(false);edit();}} openSource={openSource}/>}</article>;
}

export function TermEditor({draft,onNew,onClose,onSaved,onDeleted}:{onNew?:()=>void;draft:TermDraft;onClose:()=>void;onSaved:(memo:TermMemo)=>void;onDeleted:(id:string)=>void}){
  const initial=draft.memo;
  const [localScope,setLocalScope]=useState(false);
  const scopeFolderId=initial?.scopeFolderId||(!initial&&localScope?draft.folderId:undefined);
  const contextSuffix=draft.contextQuery?'?'+draft.contextQuery:'';
  const [term,setTerm]=useState(initial?.term||draft.word),[body,setBody]=useState(initial?.body||''),[aliases,setAliases]=useState(initial?.aliases.join('\n')||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[preview,setPreview]=useState<'popover'|'full'>('popover'),[reading,setReading]=useState(false);
  const [removing,setRemoving]=useState(false);
  const root=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),requestClose=useRef<()=>void>(()=>{});
  const formatSelection=useRef<{start:number;end:number}|null>(null);
  useLayoutEffect(()=>{const selection=formatSelection.current;if(!selection)return;formatSelection.current=null;input.current?.focus();input.current?.setSelectionRange(selection.start,selection.end);},[body]);
  const dirty=(!initial&&localScope)||term!==(initial?.term||draft.word)||body!==(initial?.body||'')||aliases!==(initial?.aliases.join('\n')||'');
  requestClose.current=()=>{if(busy)return;if(dirty)setDiscard(true);else onClose();};
  useEffect(()=>{const previous=document.activeElement as HTMLElement;input.current?.focus({preventScroll:true});const f=(e:KeyboardEvent)=>{if(!root.current?.contains(e.target as Node))return;if(e.key==='Escape'){e.preventDefault();requestClose.current();}if(e.key==='Tab'){const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')||[]).filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};window.addEventListener('keydown',f);return()=>{window.removeEventListener('keydown',f);previous?.focus({preventScroll:true});};},[]);
  useEffect(()=>{const f=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f);},[dirty]);
  function format(kind:'heading'|'list'|'bold'|'code'){
    const el=input.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd,selected=body.slice(start,end),sample=kind==='heading'?'見出し':kind==='list'?'要点':kind==='bold'?'大事な言葉':'// コードを書く';
    const text=selected||sample;let inserted=kind==='heading'?'## '+text:kind==='list'?text.split('\n').map(line=>'- '+line).join('\n'):kind==='bold'?'**'+text+'**':'```cpp\n'+text+'\n```';
    if(kind!=='bold'){if(start>0&&!body.slice(0,start).endsWith('\n\n'))inserted='\n\n'+inserted;if(end<body.length&&!body.slice(end).startsWith('\n\n'))inserted+='\n\n';}
    const value=body.slice(0,start)+inserted+body.slice(end);if(value.length>10000){setError('説明は10,000文字以内で入力してください。');return;}const offset=inserted.indexOf(text);formatSelection.current={start:start+offset,end:start+offset+text.length};setBody(value);setError('');
  }
  const previewMemo:TermMemo={id:initial?.id||'preview',term,body,aliases:aliases.split(/[\n,、]/).map(s=>s.trim()).filter(Boolean),sourceBookId:initial?.sourceBookId||draft.source?.bookId||null,sourcePage:initial?.sourcePage||draft.source?.page||null,sourceTitle:initial?.sourceTitle,updatedAt:initial?.updatedAt||'',scopeFolderId,scopeFolderName:initial?.scopeFolderName||draft.folderName};
  async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
    const response=await fetch('/api/terms'+(initial?'/'+initial.id:'')+contextSuffix,{method:initial?'PUT':'POST',headers:{'Content-Type':'application/json',...(initial?{'If-Match':JSON.stringify(initial.updatedAt)}:{})},body:JSON.stringify({term,body,scopeFolderId,aliases:previewMemo.aliases,sourceBookId:draft.source?.bookId,sourcePage:draft.source?.page})});
    const data:any=await response.json();if(!response.ok)throw new Error(data.error||'用語メモを保存できませんでした。');onSaved(data.term);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function remove(){
    if(!initial)return;setBusy(true);
    try{const response=await fetch('/api/terms/'+encodeURIComponent(initial.id)+contextSuffix,{method:'DELETE',headers:{'If-Match':JSON.stringify(initial.updatedAt)}});const data=await response.json();if(!response.ok)throw new Error(data.error||'用語メモを削除できませんでした。');onDeleted(initial.id);}finally{setBusy(false);}
  }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)requestClose.current();}}><div ref={root} className="upload-dialog term-dialog" role="dialog" aria-modal="true" aria-labelledby="term-editor-heading"><div className="dialog-top"><span className="dialog-icon"><BookOpen size={22}/></span><button className="icon-button" aria-label="用語メモを閉じる" disabled={busy} onClick={()=>requestClose.current()}><X size={20}/></button></div><h2 id="term-editor-heading">{initial?'用語メモを編集':'自分の言葉で、用語を覚える。'}</h2><p className="muted">見出しや箇条書きで整理し、プレビューで見え方を確認できます。</p><form onSubmit={save}>
    {initial?<section className="scope-choice"><strong>{scopeLabel(initial)}</strong><p>保存済みメモの共有範囲は固定です。内容を保つため、別の範囲には新規作成します。</p>{onNew&&<button type="button" className="text-button" disabled={busy||dirty} onClick={onNew}>同じ用語を別の共有範囲に新規作成</button>}</section>:<fieldset className="scope-choice"><legend>このメモの共有範囲</legend><label><input type="radio" name="memo-scope" checked={!localScope} onChange={()=>setLocalScope(false)} disabled={busy}/>全体で共有（既定）</label><label><input type="radio" name="memo-scope" checked={localScope} onChange={()=>setLocalScope(true)} disabled={busy||!draft.folderId}/>このフォルダ内のみで共有{draft.folderName?'：'+draft.folderName:''}</label><p>{draft.folderId?'このフォルダの教材では、全体共有と限定メモを両方使えます。':'限定共有には、教材をフォルダに配置するか、用語メモ一覧でフォルダを選んでください。'}</p></fieldset>}<div className="term-editor-layout"><div className="term-editor-fields"><label className="field-label" htmlFor="term-name">用語</label><input id="term-name" className="title-input" value={term} onChange={e=>setTerm(e.target.value)} maxLength={120} required disabled={busy}/><label className="field-label" htmlFor="term-body">自分の言葉での説明</label><div className="term-format-tools" role="group" aria-label="説明の書式"><button type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>format('heading')}>見出し</button><button type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>format('list')}>箇条書き</button><button type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>format('bold')}>太字</button><button type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>format('code')}>コード</button></div><textarea ref={input} id="term-body" className="term-input" value={body} onChange={e=>setBody(e.target.value)} placeholder={'まず一言で意味を書く。\n\n## 使う場面\n- どんなときに使う？\n- 似た言葉との違いは？'} maxLength={10000} required disabled={busy}/><div className="term-writing-hint"><span>空行で段落を区切れます。書式ボタンも使えます。</span><span>{body.length.toLocaleString()} / 10,000</span></div><details className="term-alias-details" open={initial?.aliases.length?true:undefined}><summary>別名・日本語名 <span>任意</span></summary><label htmlFor="term-aliases" className="sr-only">別名・日本語名（1行に1つ）</label><textarea id="term-aliases" className="term-input alias-input" value={aliases} onChange={e=>setAliases(e.target.value)} placeholder="サブシステム（1行に1つ）" maxLength={2500} disabled={busy}/><p className="upload-footnote">別名からも同じメモを開けます。</p></details></div>
    <section className="term-preview-panel" aria-label="用語メモの表示プレビュー"><div className="term-preview-heading"><h3><Eye size={17}/>表示プレビュー</h3><span>{dirty?'保存前のプレビュー':initial?'保存済みの内容':'入力中のプレビュー'}</span></div><div className="term-preview-modes" role="group" aria-label="プレビューの表示方法"><button type="button" aria-pressed={preview==='popover'} onClick={()=>setPreview('popover')}>教材の小窓</button><button type="button" aria-pressed={preview==='full'} onClick={()=>setPreview('full')}>全文</button></div><div className="term-preview-stage">{preview==='popover'?<div className="term-popover term-popover-preview"><div className="term-popover-top"><span><BookOpen size={15}/>用語メモ</span></div><div className="term-popover-scroll"><MemoContent memo={{...previewMemo,body:body||'説明を書くと、ここに表示されます。'}}/></div><div className="term-popover-actions"><button type="button" className="button small" disabled={!body.trim()} onClick={()=>setReading(true)}>大きく読む</button><span>編集する</span></div></div>:<div className="term-full-preview"><MemoContent memo={{...previewMemo,body:body||'説明を書くと、ここに表示されます。'}}/></div>}</div><button type="button" className="text-button" disabled={!body.trim()} onClick={()=>setReading(true)}><BookOpen size={16}/>実際の大きさで開く</button></section></div>
    <div className="term-editor-footer">{initial&&<button type="button" className="text-button memo-delete" disabled={busy} onClick={()=>setRemoving(true)}><Trash2 size={16}/>この用語メモを削除</button>}{error&&<div className="notice" role="alert">{error}</div>}{discard&&<div className="discard-notice" role="alert"><p>保存していない変更があります。</p><button type="button" className="text-button" onClick={()=>setDiscard(false)}>編集を続ける</button><button type="button" className="text-button" onClick={onClose}>変更を破棄して閉じる</button></div>}<button className="button primary full" type="submit" disabled={busy||!term.trim()||!body.trim()}>{busy?<LoaderCircle size={16} className="spin"/>:<Save size={16}/>}用語メモを保存</button></div></form>{reading&&<TermReader memo={previewMemo} close={()=>setReading(false)}/>} {removing&&initial&&<MemoRemovalDialog kind="用語メモ" title={initial.term} description={"この共有範囲のメモと別名を削除します。別の範囲のメモは残ります。"+(dirty?" 保存していない変更も破棄します。":"")} cancel={()=>setRemoving(false)} remove={remove}/>}</div></div>;
}

type Hit={memoId:string;left:number;top:number;width:number;height:number};
/** A selectable surface. PDF.js owns the transparent text runs; React owns the hits. */
export function TermSurface({children,textRoot,revision,actions,source,pdf=false,style}:{children:React.ReactNode;textRoot:React.RefObject<HTMLElement|null>;revision:number|string;actions:TermActions;source:TermSource;pdf?:boolean;style?:React.CSSProperties}){
  const root=useRef<HTMLDivElement>(null),peekRoot=useRef<HTMLDivElement>(null);
  const [hits,setHits]=useState<Hit[]>([]),[selection,setSelection]=useState('');
  const selectionTools=useRef<HTMLDivElement>(null),selecting=useRef(false);
  const [selectionAnchor,setSelectionAnchor]=useState<SelectionAnchor>({left:12,right:12,top:12,bottom:12}),[selectionSize,setSelectionSize]=useState({width:520,height:60});
  useLayoutEffect(()=>{const el=selectionTools.current;if(!el)return;const measure=()=>setSelectionSize(old=>old.width===el.offsetWidth&&old.height===el.offsetHeight?old:{width:el.offsetWidth,height:el.offsetHeight});measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[selection]);
  const selectionMeta=useRef<{source:TermSource;mode:'code'|'text'}|null>(null);
  const [peek,setPeek]=useState<{memoId:string;anchor:TermAnchor}|null>(null),[popupSize,setPopupSize]=useState({width:500,height:350});
  const peekTrigger=useRef<HTMLElement|null>(null);
  const [reading,setReading]=useState<TermMemo|null>(null);
  useEffect(()=>{setSelection('');setPeek(null);},[source?.bookId,source?.page,source?.blockId]);
  useLayoutEffect(()=>{const el=peekRoot.current;if(!el)return;const measure=()=>setPopupSize(old=>old.width===el.offsetWidth&&old.height===el.offsetHeight?old:{width:el.offsetWidth,height:el.offsetHeight});measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[peek?.memoId]);
  useEffect(()=>{const f=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPeek(null);setSelection('');}};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[]);
  const insidePeek=(target:EventTarget|null)=>target instanceof Node&&!!peekRoot.current?.contains(target);
  useEffect(()=>{if(!peek)return;const close=(e:PointerEvent)=>{if(!insidePeek(e.target)&&!(e.target instanceof Element&&e.target.closest('.term-hit')))setPeek(null);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[peek?.memoId]);
  useEffect(()=>{const el=textRoot.current,outer=root.current;if(!el||!outer){setHits([]);return;}
    const measure=()=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT),nodes:{node:Text;start:number;end:number}[]=[];let text='',n:Node|null,previousBlock:Element|null=null;
    // Keep block/line boundaries without splitting a name across inline spans.
    // Virtual separators belong to the lookup text, never to the textbook DOM.
    while((n=walker.nextNode())){
      if(n.parentElement?.closest('[aria-hidden="true"]'))continue;
      if(n instanceof Element){if(n.tagName==='BR')text+='\n';continue;}
      const node=n as Text,block=node.parentElement?.closest('p,pre,td,th,li,h1,h2,h3,h4,h5,h6,[data-block-id]')||el;
      if(nodes.length&&block!==previousBlock)text+='\n';previousBlock=block;
      nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;
    }
    const matches=termMatches(text,actions.terms),box=outer.getBoundingClientRect(),next:Hit[]=[];
    for(const m of matches){
      const first=nodes.find(n=>m.start>=n.start&&m.start<n.end),last=nodes.find(n=>m.end>n.start&&m.end<=n.end);if(!first||!last)continue;
      const range=document.createRange();range.setStart(first.node,m.start-first.start);range.setEnd(last.node,m.end-last.start);
      const lines:{left:number;right:number;top:number;bottom:number}[]=[];
      const clip=first.node.parentElement?.closest('.web-code,.web-table-scroll')?.getBoundingClientRect();
      for(const raw of Array.from(range.getClientRects())){
        const rect=clip?{left:Math.max(raw.left,clip.left+1),right:Math.min(raw.right,clip.right-1),top:Math.max(raw.top,clip.top+1),bottom:Math.min(raw.bottom,clip.bottom-1),width:Math.min(raw.right,clip.right-1)-Math.max(raw.left,clip.left+1),height:Math.min(raw.bottom,clip.bottom-1)-Math.max(raw.top,clip.top+1)}:raw;
        if(rect.width<=0||rect.height<=0)continue;
        const line=lines.find(l=>Math.abs((l.top+l.bottom)/2-(rect.top+rect.bottom)/2)<Math.max(l.bottom-l.top,rect.height)*.45&&rect.left<=l.right+2&&rect.right>=l.left-2);
        if(line){line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);line.top=Math.min(line.top,rect.top);line.bottom=Math.max(line.bottom,rect.bottom);}else lines.push({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom});
      }
      for(const line of lines)next.push({memoId:m.memoId,left:line.left-box.left,top:line.top-box.top,width:line.right-line.left,height:line.bottom-line.top});
    }
    setHits(next);setPeek(null);
    };
    // Only scrolling the textbook invalidates its hit geometry. The memo is an
    // interactive descendant, so its own scrollbars must not close the memo.
    const scroll=(event:Event)=>{if(!insidePeek(event.target))measure();};
    measure();const observer=new ResizeObserver(measure);observer.observe(outer);outer.addEventListener('scroll',scroll,true);return()=>{observer.disconnect();outer.removeEventListener('scroll',scroll,true);};
  },[revision,actions.terms,textRoot]);
  function capture(){
    if(selecting.current||peekRoot.current)return;
    const s=window.getSelection(),el=textRoot.current;if(!s||!el||s.isCollapsed||!s.anchorNode||!s.focusNode||!el.contains(s.anchorNode)||!el.contains(s.focusNode)){setSelection('');return;}
    const text=s.toString().replace(/\r\n?/g,'\n');if(!text.trim()||text.length>10000){setSelection('');return;}
    const node=s.getRangeAt(0).startContainer,parent=node.nodeType===Node.ELEMENT_NODE?node as HTMLElement:node.parentElement,segment=parent?.closest<HTMLElement>('[data-source-page][data-block-id]');
    const clip=el.closest('.pdf-stage,.web-reading,.term-text-scroll')?.getBoundingClientRect(),viewport={left:Math.max(0,clip?.left||0),right:Math.min(innerWidth,clip?.right??innerWidth),top:Math.max(0,clip?.top||0),bottom:Math.min(innerHeight,clip?.bottom??innerHeight)};
    const visible=(r:DOMRect)=>r.height>0&&r.bottom>viewport.top&&r.top<viewport.bottom&&r.right>=viewport.left&&r.left<=viewport.right;
    const caret=document.createRange();caret.setStart(s.focusNode,s.focusOffset);caret.collapse(true);const end=caret.getBoundingClientRect(),rect=visible(end)?end:Array.from(s.getRangeAt(0).getClientRects()).filter(visible).at(-1);
    if(!rect){setSelection('');return;}
    setSelectionAnchor({left:Math.max(viewport.left,rect.left),right:Math.min(viewport.right,rect.right),top:Math.max(viewport.top,rect.top),bottom:Math.min(viewport.bottom,rect.bottom)});
    selectionMeta.current={source:segment&&el.contains(segment)?{bookId:source.bookId,page:Number(segment.dataset.sourcePage),blockId:segment.dataset.blockId}:source,mode:parent?.closest('.web-code')||(/\b(?:class|void|public|private|return|using|namespace)\b|[A-Za-z_]\w*\s*\([^)]*\)\s*[;{]/.test(text))?'code':'text'};setSelection(text);setPeek(null);
  }
  function selectionSource():TermSource{return selectionMeta.current?.source||source;}
  useEffect(()=>{const released=(event:PointerEvent)=>{if(insidePeek(event.target))return;selecting.current=false;capture();};const scroll=(event:Event)=>{if(!insidePeek(event.target))capture();};document.addEventListener('selectionchange',capture);document.addEventListener('pointerup',released);window.addEventListener('scroll',scroll,{capture:true,passive:true});window.addEventListener('resize',capture);return()=>{document.removeEventListener('selectionchange',capture);document.removeEventListener('pointerup',released);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',capture);};},[source.bookId,source.page,source.blockId]);
  function show(hit:Hit,target:HTMLElement){peekTrigger.current=target;const box=target.getBoundingClientRect();setPeek({memoId:hit.memoId,anchor:{left:box.left,top:box.top,width:box.width,height:box.height}});}
  const memo=actions.terms.find(t=>t.id===peek?.memoId);
  const placement=peek?termPopoverPosition(peek.anchor,popupSize,{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight}):null;
  const selectionPosition=selectionToolbarPosition(selectionAnchor,selectionSize,{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight});
  return <div className={'term-surface '+(pdf?'pdf-paper':'')} ref={root} style={style} onPointerDown={e=>{if(!insidePeek(e.target)&&root.current?.contains(e.target as Node)){selecting.current=true;setSelection('');}}} onMouseUp={e=>{if(!insidePeek(e.target)){selecting.current=false;capture();}}} onTouchEnd={e=>{if(!insidePeek(e.target)){selecting.current=false;setTimeout(capture,0);}}} onKeyUp={e=>{if(!insidePeek(e.target)&&(e.key==='Shift'||e.key.startsWith('Arrow')))capture();}}>
    {children}
    <div className="term-hit-layer" aria-label="登録済みの用語">{hits.map((h,i)=>{const term=actions.terms.find(t=>t.id===h.memoId);return <button key={i} className="term-hit" aria-label={'用語メモ：'+(term?.term||'')} aria-haspopup="dialog" aria-expanded={peek?.memoId===h.memoId} style={{left:h.left,top:h.top,width:h.width,height:h.height}} onClick={e=>{e.stopPropagation();setSelection('');show(h,e.currentTarget);}}/>;})}</div>
    {selection&&createPortal(<div ref={selectionTools} className="selection-tools" role="group" aria-label="選択した文章の操作" style={selectionPosition}><span>「{selection}」</span>{actions.practice&&<button className="button small primary" onMouseDown={e=>e.preventDefault()} onClick={()=>{actions.practice?.(selection,selectionSource(),selectionMeta.current?.mode||'text');setSelection('');window.getSelection()?.removeAllRanges();}}><Play size={15}/>虫食いにする</button>}{selection.replace(/\s+/g,' ').trim().length<=120&&<button className={'button small '+(!actions.practice?'primary':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>{actions.edit(selection.replace(/\s+/g,' ').trim(),selectionSource());setSelection('');window.getSelection()?.removeAllRanges();}}><Plus size={14}/>{findTerm(actions.terms,selection)?'用語メモを開く':'用語メモを作る'}</button>}{actions.mark&&selection.length<=2000&&<button className="button small" onMouseDown={e=>e.preventDefault()} onClick={()=>{actions.mark?.(selection,selectionSource());setSelection('');window.getSelection()?.removeAllRanges();}}><Flag size={14}/>課題にする</button>}<button className="icon-button" aria-label="選択を解除" onClick={()=>{setSelection('');window.getSelection()?.removeAllRanges();}}><X size={14}/></button></div>,document.fullscreenElement||root.current?.closest('.app-shell')||document.body)}
    {memo&&peek&&placement&&<div ref={peekRoot} className="term-popover" role="dialog" aria-label={'用語メモ：'+memo.term} data-side={placement.side} style={{left:placement.left,top:placement.top,'--term-arrow-offset':placement.arrowOffset+'px'} as React.CSSProperties}><span className="term-popover-arrow" aria-hidden="true"/><div className="term-popover-top"><span><BookOpen size={15}/>用語メモ</span><button className="icon-button" aria-label="用語メモの表示を閉じる" onClick={()=>setPeek(null)}><X size={15}/></button></div><div className="term-popover-scroll" tabIndex={0} aria-label="用語メモの内容"><MemoContent memo={memo}/></div><div className="term-popover-actions"><button className="button small" onClick={()=>{setReading(memo);setPeek(null);}}>大きく読む</button><button className="text-button" onClick={()=>{actions.edit(memo.term,source,memo.id);setPeek(null);}}>編集する <NotebookPen size={14}/></button>{globalAlternatives(memo,actions.terms).map(other=><button key={other.id} className="text-button scope-alternative" onClick={()=>{setReading(other);setPeek(null);}}>全体共有「{other.term}」を読む</button>)}{memo.sourceBookId&&memo.sourcePage&&<button className="text-button" onClick={()=>{actions.openSource(memo.sourceBookId!,memo.sourcePage!);setPeek(null);}}>元のページ <ArrowUpRight size={14}/></button>}</div></div>}
    {reading&&<TermReader memo={reading} close={()=>{setReading(null);peekTrigger.current?.focus({preventScroll:true});}} edit={()=>{setReading(null);actions.edit(reading.term,source,reading.id);}} openSource={actions.openSource}/>}
  </div>;
}

import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,X,NotebookPen,ArrowUpRight} from 'lucide-react';
import {scopeLabel,type TermMemo} from './lib/term-types';
import TermBody from './term-body';

export function MemoContent({memo}:{memo:Pick<TermMemo,'term'|'aliases'|'body'|'scopeFolderId'|'scopeFolderName'>}){
  return <><span className={'memo-scope '+(memo.scopeFolderId?'is-local':'')}>{scopeLabel(memo)}</span><h3>{memo.term||'用語名'}</h3>{memo.aliases.length>0&&<p className="term-aliases">別名：{memo.aliases.join(' / ')}</p>}<TermBody body={memo.body}/></>;
}

export default function TermReader({memo,close,edit,openSource}:{memo:TermMemo;close:()=>void;edit?:()=>void;openSource?:(id:string,page:number)=>void}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;root.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')||[]);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus({preventScroll:true});};},[]);
  return createPortal(<div className="modal-backdrop term-reader-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><div className="term-reader-dialog" ref={root} role="dialog" aria-modal="true" aria-labelledby="term-reader-heading"><header><span><BookOpen size={18}/><span id="term-reader-heading">用語メモを読む</span></span><button className="icon-button" aria-label="大きい用語メモを閉じる" onClick={close}><X size={21}/></button></header><div className="term-reader-content" tabIndex={0} aria-label="用語メモの全文"><MemoContent memo={memo}/></div><footer>{edit&&<button className="button small" onClick={edit}><NotebookPen size={16}/>編集する</button>}{openSource&&memo.sourceBookId&&memo.sourcePage&&<button className="text-button" onClick={()=>{openSource(memo.sourceBookId!,memo.sourcePage!);close();}}>元のページ<ArrowUpRight size={15}/></button>}<button className="button small" onClick={close}>閉じる</button></footer></div></div>,document.fullscreenElement||document.querySelector('.app-shell')||document.body);
}

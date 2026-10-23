import type {Ref} from 'react';
export type BookStatusFilter='all'|'unfinished'|'completed';
export function initialBookStatus():BookStatusFilter{
  const value=new URLSearchParams(location.search).get('status');
  return value==='unfinished'||value==='completed'?value:'all';
}
export default function BookStatusFilterControl({value,total,completed,change,rootRef}:{value:BookStatusFilter;total:number;completed:number;change:(value:BookStatusFilter)=>void;rootRef:Ref<HTMLDivElement>}){
  const choices:[BookStatusFilter,string,number][]=[['all','すべて',total],['unfinished','未完了',total-completed],['completed','学習済み',completed]];
  return <div className="book-status-filter" role="group" aria-label="教材の学習状況で絞り込み" ref={rootRef}>{choices.map(([id,label,count])=><button key={id} type="button" aria-pressed={value===id} onClick={()=>change(id)}>{label}<span>{count}</span></button>)}</div>;
}

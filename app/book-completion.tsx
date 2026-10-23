export default function BookCompletionToggle({title,completed,busy,change}:{title:string;completed:boolean;busy:boolean;change:(completed:boolean)=>void}){
  return <label className={'book-completion'+(completed?' is-complete':'')}><input type="checkbox" aria-label={title+'の学習済み'} checked={completed} disabled={busy} onChange={e=>change(e.target.checked)}/><span>{completed?'学習済み':'学習済みにする'}</span></label>;
}

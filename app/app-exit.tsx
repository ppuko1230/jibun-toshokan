import {useState} from 'react';
export default function AppExit({dirty,busy,parentBusy,stopped}:{dirty:boolean;busy:boolean;parentBusy:(value:boolean)=>void;stopped:()=>void}){
  const [saved,setSaved]=useState(false),[error,setError]=useState('');
  async function stop(){
    if(busy||dirty||!saved)return;parentBusy(true);setError('');
    try{const response=await fetch('/api/shutdown',{method:'POST'});if(!response.ok)throw Error('終了できませんでした。もう一度お試しください。');stopped();}
    catch(e){setError((e as Error).message);}finally{parentBusy(false);}
  }
  return <details className="backup-section"><summary>アプリを終了する</summary><p>フォルダーを移動するときなどに、本棚の本体も終了できます。先にすべての画面の編集を保存してください。</p><label><input type="checkbox" checked={saved} disabled={busy} onChange={e=>setSaved(e.target.checked)}/> ほかの画面の編集も保存しました</label>{dirty&&<p className="notice">この画面の補足が未保存です。設定を閉じて保存してください。</p>}<p><button className="button" disabled={busy||dirty||!saved} onClick={stop}>本棚を終了する</button></p>{error&&<p className="notice" role="alert">{error}</p>}</details>;
}

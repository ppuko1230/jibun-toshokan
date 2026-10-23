import {useState,type KeyboardEvent} from 'react';
import {Hand,NotebookPen} from 'lucide-react';
import {defaultReaderModeKeys,modeKeyLabel,validModeKey,type ReaderModeKeys} from './lib/reader-mode-keys';
import './reader-mode-key-settings.css';

export default function ReaderModeKeySettings({value,busy,change}:{value:ReaderModeKeys;busy:boolean;change:(keys:ReaderModeKeys)=>Promise<boolean>}){
  const [listening,setListening]=useState<keyof ReaderModeKeys|null>(null),[error,setError]=useState('');
  async function assign(keys:ReaderModeKeys){setListening(null);setError('');if(!await change(keys))setError('キーを保存できませんでした。もう一度お試しください。');}
  function capture(event:KeyboardEvent<HTMLButtonElement>,mode:keyof ReaderModeKeys){
    if(listening!==mode||event.key==='Tab')return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Escape'){setListening(null);setError('');return;}
    if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.nativeEvent.isComposing||!validModeKey(event.code)){setError('数字・英字・Spaceなど、修飾キーなしのキーを選んでください。');return;}
    const other=mode==='pan'?'memo':'pan';
    if(value[other]===event.code){setError('2つのモードには別のキーを割り当ててください。');return;}
    void assign({...value,[mode]:event.code});
  }
  return <section className="backup-section mode-key-settings"><h3>紙面の操作キー</h3><p>ボタンを選んで、割り当てたいキーを押してください。PDFを読んでいるときに切り替えられます。メモの入力中は文字をそのまま入力できます。</p>
    {(['pan','memo'] as const).map(mode=><div className="mode-key-row" key={mode}><span>{mode==='pan'?<Hand size={17}/>:<NotebookPen size={17}/>}<span>{mode==='pan'?'紙面をつかむ':'文字を選ぶ・メモ'}</span></span><button className={'button mode-key-button '+(listening===mode?'is-saved':'')} disabled={busy} aria-label={(mode==='pan'?'紙面をつかむ':'文字を選ぶ・メモ')+'のキーを変更：'+modeKeyLabel(value[mode])} aria-pressed={listening===mode} onClick={()=>{setListening(mode);setError('');}} onBlur={()=>setListening(null)} onKeyDown={event=>capture(event,mode)}>{listening===mode?'キーを押してください…':modeKeyLabel(value[mode])}</button></div>)}
    <button className="text-button" disabled={busy} onClick={()=>void assign(defaultReaderModeKeys)}>1・2キーに戻す</button><p className="backup-small" aria-live="polite">{error||'Escでキーの変更を取り消せます。設定はこのPCに保存します。'}</p>
  </section>;
}

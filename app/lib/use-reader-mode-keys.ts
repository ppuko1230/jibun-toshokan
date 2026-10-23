import {useEffect} from 'react';
import {readerModeForKey,type ReaderModeKeys} from './reader-mode-keys';

export function useReaderModeKeys(keys:ReaderModeKeys,setHandMode:(value:boolean)=>void){
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||document.querySelector('.modal-backdrop,[role="dialog"],[role="alertdialog"]'))return;
      const target=event.target instanceof Element?event.target:null;
      if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],audio,video'))return;
      if(event.code==='Space'&&target?.closest('button,a,summary'))return;
      const mode=readerModeForKey(event,keys);if(!mode)return;
      event.preventDefault();event.stopPropagation();if(!event.repeat)setHandMode(mode==='pan');
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[keys.pan,keys.memo,setHandMode]);
}

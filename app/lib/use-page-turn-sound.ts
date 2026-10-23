import {useEffect,useRef} from 'react';
import {pageTurnSamples} from './page-turn-audio';

/** A quiet paper rustle, generated locally; no audio files or network requests. */
export function usePageTurnSound(enabled:boolean){
  const context=useRef<AudioContext|null>(null),noise=useRef<AudioBuffer|null>(null),playing=useRef<AudioBufferSourceNode|null>(null),on=useRef(enabled);on.current=enabled;
  useEffect(()=>{
    if(!enabled){playing.current?.stop();playing.current=null;return;}
    const unlock=()=>{if(!on.current)return;try{context.current??=new AudioContext();if(context.current.state==='suspended')void context.current.resume().catch(()=>{});}catch{/* Audio is optional. */}};
    window.addEventListener('pointerdown',unlock,{capture:true});window.addEventListener('keydown',unlock,{capture:true});
    return()=>{window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',unlock,true);};
  },[enabled]);
  useEffect(()=>()=>{playing.current?.stop();void context.current?.close().catch(()=>{});},[]);
  return ()=>{
    const audio=context.current;if(!on.current||!audio||audio.state!=='running')return;
    try{
      playing.current?.stop();
      if(!noise.current){const samples=pageTurnSamples(audio.sampleRate),buffer=audio.createBuffer(1,samples.length,audio.sampleRate);buffer.getChannelData(0).set(samples);noise.current=buffer;}
      const source=audio.createBufferSource();source.buffer=noise.current;source.playbackRate.value=.98+Math.random()*.04;
      source.connect(audio.destination);playing.current=source;
      source.onended=()=>{source.disconnect();if(playing.current===source)playing.current=null;};source.start();
    }catch{/* Sound must never interrupt reading. */}
  };
}

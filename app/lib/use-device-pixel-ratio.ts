import {useEffect,useState} from 'react';

/** Browser zoom and moving to another monitor can change density without changing PDF size. */
export function useDevicePixelRatio(){
  const [ratio,setRatio]=useState(()=>typeof window==='undefined'?1:window.devicePixelRatio||1);
  useEffect(()=>{
    const changed=()=>setRatio(window.devicePixelRatio||1),media=matchMedia(`(resolution: ${ratio}dppx)`);
    media.addEventListener('change',changed);window.addEventListener('resize',changed);changed();
    return()=>{media.removeEventListener('change',changed);window.removeEventListener('resize',changed);};
  },[ratio]);
  return ratio;
}

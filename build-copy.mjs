import {cpSync} from 'node:fs';

// Node 22's native directory-copy path crashes on Windows Unicode paths here.
// Supplying a synchronous filter selects Node's JS traversal instead. It keeps
// normal permission checks/options and lets filesystem errors propagate.
export function copyBuildAsset(source,target,options={}){
  return cpSync(source,target,{...options,filter:options.filter??(()=>true)});
}
